#!/usr/bin/env python3
"""
Traces outlines straight off the campus art, for the few shapes OpenStreetMap does not have.

    python3 scripts/trace-art-shapes.py real_map.jpeg

Most places get their footprint from OSM, which is surveyed and precise. A handful of
buildings are drawn on the art but absent from OSM entirely - G Hostel and the Department of
Chemical Engineering among them - so there is nothing to adopt. Rather than draw boxes by
eye, this flood-fills the drawn shape under each supplement point and traces its boundary,
which lands on the art's own edges to the pixel.

Fills in `outline` for any entry in scripts/place-supplement.json that lacks one and whose
point sits on a drawn shape, and writes the file back. Entries that already carry an outline
are left alone, so re-running is safe; delete an outline to force a re-trace.
"""

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SUPPLEMENT = ROOT / "scripts" / "place-supplement.json"

# The art's flat fills. A pixel joins a shape if it is nearer this than TOLERANCE.
FAMILIES = {
    "building": (221, 112, 109),
    "green": (144, 211, 155),
}
TOLERANCE = 60

# Douglas-Peucker tolerance in art pixels. The shapes have long straight walls, so this
# throws away most of the staircase the tracer produces without rounding off real corners.
SIMPLIFY_EPSILON = 3.0


def family_mask(rgb, colour):
    distance = np.sqrt(((rgb.astype(np.int16) - np.array(colour, dtype=np.int16)) ** 2).sum(axis=2))
    return distance < TOLERANCE


def flood(mask, start):
    """The connected run of `mask` containing `start`, 4-connected."""
    h, w = mask.shape
    sx, sy = start
    if not (0 <= sx < w and 0 <= sy < h) or not mask[sy, sx]:
        return None
    seen = np.zeros_like(mask, dtype=bool)
    seen[sy, sx] = True
    queue = deque([(sx, sy)])
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return seen


def trace_boundary(region):
    """Moore-neighbourhood contour trace of the outer boundary of a filled region."""
    ys, xs = np.nonzero(region)
    if len(xs) == 0:
        return []
    # Start at the topmost-then-leftmost pixel, which is guaranteed to be on the boundary.
    top = ys.min()
    start = (xs[ys == top].min(), top)

    # Clockwise, starting from "west" so the first probe of a top-left pixel is outside.
    neighbours = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]
    h, w = region.shape

    def solid(p):
        x, y = p
        return 0 <= x < w and 0 <= y < h and region[y, x]

    contour = [start]
    current = start
    backtrack = 0  # index into `neighbours` we came from
    for _ in range(4 * int(region.sum()) + 8):
        found = False
        for step in range(8):
            idx = (backtrack + step) % 8
            dx, dy = neighbours[idx]
            candidate = (current[0] + dx, current[1] + dy)
            if solid(candidate):
                # Resume scanning from just behind where we entered the new pixel.
                backtrack = (idx + 5) % 8
                current = candidate
                found = True
                break
        if not found:
            break
        if current == start and len(contour) > 2:
            break
        contour.append(current)
    return contour


def perpendicular_distance(point, start, end):
    (x, y), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / ((dx * dx + dy * dy) ** 0.5)


def simplify(points, epsilon):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    first, last = points[0], points[-1]
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], first, last)
        if d > worst:
            worst, index = d, i
    if worst <= epsilon:
        return [first, last]
    left = simplify(points[: index + 1], epsilon)
    right = simplify(points[index:], epsilon)
    return left[:-1] + right


def main():
    art = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "real_map.jpeg")
    rgb = np.asarray(Image.open(art).convert("RGB"))
    masks = {name: family_mask(rgb, colour) for name, colour in FAMILIES.items()}

    data = json.loads(SUPPLEMENT.read_text())
    changed = 0
    for entry in data["places"]:
        if entry.get("outline"):
            continue
        point = tuple(entry["at"])
        for family, mask in masks.items():
            region = flood(mask, point)
            if region is None or region.sum() < 200:
                continue
            contour = trace_boundary(region)
            if len(contour) < 8:
                continue
            simplified = simplify(contour + [contour[0]], SIMPLIFY_EPSILON)
            if simplified and simplified[0] == simplified[-1]:
                simplified = simplified[:-1]
            entry["outline"] = [[int(x), int(y)] for x, y in simplified]
            entry["outlineSource"] = f"traced from art ({family})"
            print(
                f'  {entry["name"]}: {family}, {region.sum()} px '
                f"-> {len(simplified)} vertices"
            )
            changed += 1
            break
        else:
            print(f'  {entry["name"]}: no drawn shape at {point}')

    if changed:
        SUPPLEMENT.write_text(json.dumps(data, indent=2) + "\n")
        print(f"updated {SUPPLEMENT} ({changed} traced)")
    else:
        print("nothing to trace")


if __name__ == "__main__":
    main()
