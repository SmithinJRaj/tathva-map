#!/usr/bin/env python3
"""
Works out where a hand-supplied campus map sits on the globe, by fitting OpenStreetMap
building footprints to the buildings drawn on it.

    python3 scripts/calibrate-basemap.py real_map.jpeg

The art is a rendering of OSM data, so its buildings are the same shapes in the same
projection as the ones Overpass returns. That makes georeferencing a registration problem
rather than a guessing game: rasterise the OSM footprints at a candidate scale, slide them
over the image's building mask, and keep whichever scale and offset line up best. Rotation
is assumed to be zero (web maps are north-up) and the projection Web Mercator, which leaves
three unknowns - scale, x offset, y offset.

Translation is solved in one step per scale with phase correlation (an FFT), so the whole
search is a loop over scales rather than a three-dimensional grid.

Writes scripts/cache/basemap-bounds.json for scripts/build-campus-map.mjs to read.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OSM_CACHE = ROOT / "scripts" / "cache" / "osm-raw.json"
OSM_WIDE = ROOT / "scripts" / "cache" / "osm-wide.json"
OUT = ROOT / "scripts" / "cache" / "basemap-bounds.json"

# The flat fills the art uses for buildings and for open ground. Both are registered against,
# since the greens are as sharply drawn as the buildings and nearly double the signal.
BUILDING_RGB = (221, 112, 109)
GREEN_RGB = (144, 211, 155)
COLOUR_TOLERANCE = 46

# Coarse pass width. Registration does not need full resolution to find the right ballpark,
# and the FFTs stay quick.
WORK_WIDTH = 512

# Refinement pass. The coarse pass quantises translation to WORK_WIDTH pixels (five art
# pixels each) and steps scale by about 1.2%, which over a 2560px image leaves tens of pixels
# of slop at the edges. This pass re-searches a narrow bracket around the coarse answer at
# four times the detail, which is what actually puts the outlines on the buildings.
REFINE_WIDTH = 2048
REFINE_SCALE_SPAN = 0.02
REFINE_SCALE_STEPS = 81

# Scales to try, as metres per pixel at the equator. The art is a web-map render, so this
# brackets roughly zoom 17 to zoom 19 for the latitude involved.
MIN_MPP, MAX_MPP, SCALE_STEPS = 0.30, 1.30, 220


def mercator_xy(lat, lon):
    """Web Mercator, normalised so the whole world is the unit square."""
    x = (lon + 180.0) / 360.0
    s = math.sin(math.radians(lat))
    y = 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)
    return x, y


def inverse_mercator(x, y):
    lon = x * 360.0 - 180.0
    lat = math.degrees(2 * math.atan(math.exp((0.5 - y) * 2 * math.pi)) - math.pi / 2)
    return lat, lon


def building_mask_from_art(path, width):
    """Binary mask of the art's drawn shapes, plus the scale it was reduced by."""
    img = Image.open(path).convert("RGB")
    full_w, full_h = img.size
    scale = width / full_w
    small = img.resize((width, max(1, round(full_h * scale))), Image.BILINEAR)
    arr = np.asarray(small).astype(np.float64)
    hit = np.zeros(arr.shape[:2], dtype=bool)
    for rgb in (BUILDING_RGB, GREEN_RGB):
        distance = np.sqrt(((arr - np.array(rgb, dtype=np.float64)) ** 2).sum(axis=2))
        hit |= distance < COLOUR_TOLERANCE
    return hit.astype(np.float32), (full_w, full_h), scale


def osm_building_rings():
    source = OSM_WIDE if OSM_WIDE.exists() else OSM_CACHE
    data = json.loads(source.read_text())
    rings = []
    for el in data["elements"]:
        if el.get("type") != "way":
            continue
        tags = el.get("tags", {})
        # Match what the mask covers: the buildings and the drawn green areas.
        if "building" not in tags and tags.get("leisure") not in ("pitch", "park", "stadium"):
            continue
        geom = el.get("geometry") or []
        if len(geom) < 3:
            continue
        rings.append([mercator_xy(p["lat"], p["lon"]) for p in geom])
    return rings, source.name


def rasterise(rings, pixels_per_world, size, origin):
    """Draws the rings onto a canvas of `size`, at the given scale and world-space origin."""
    canvas = Image.new("F", size, 0.0)
    draw = ImageDraw.Draw(canvas)
    ox, oy = origin
    for ring in rings:
        pts = [((x - ox) * pixels_per_world, (y - oy) * pixels_per_world) for x, y in ring]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        # Skip rings that fall entirely outside the canvas; they only cost time.
        if max(xs) < 0 or min(xs) > size[0] or max(ys) < 0 or min(ys) > size[1]:
            continue
        draw.polygon(pts, fill=1.0)
    return np.asarray(canvas, dtype=np.float32)


def best_shift(reference, candidate):
    """Phase correlation: the (dy, dx) that best aligns `candidate` onto `reference`."""
    ref = reference - reference.mean()
    can = candidate - candidate.mean()
    spectrum = np.fft.rfft2(ref) * np.conj(np.fft.rfft2(can))
    magnitude = np.abs(spectrum)
    magnitude[magnitude == 0] = 1e-12
    correlation = np.fft.irfft2(spectrum / magnitude, s=ref.shape)
    peak = np.unravel_index(np.argmax(correlation), correlation.shape)
    dy, dx = peak
    if dy > ref.shape[0] // 2:
        dy -= ref.shape[0]
    if dx > ref.shape[1] // 2:
        dx -= ref.shape[1]
    return dy, dx, float(correlation[peak])


def overlap_score(a, b):
    """Jaccard, the thing we actually care about once a shift is proposed."""
    inter = float(np.minimum(a, b).sum())
    union = float(np.maximum(a, b).sum())
    return inter / union if union else 0.0


def search(mask, rings, work_scale, size, centre, scales):
    """Best (scale, shift) over the given scale candidates, by overlap with the mask."""
    equator_m = 40075016.686
    best = None
    for metres_per_pixel in scales:
        full_ppw = equator_m / metres_per_pixel
        ppw = full_ppw * work_scale
        origin = (centre[0] - size[0] / 2 / ppw, centre[1] - size[1] / 2 / ppw)
        raster = rasterise(rings, ppw, size, origin)
        if raster.sum() < 50:
            continue
        dy, dx, _ = best_shift(mask, raster)
        shifted = np.roll(np.roll(raster, dy, axis=0), dx, axis=1)
        score = overlap_score(mask, shifted)
        if best is None or score > best["score"]:
            best = {
                "score": score,
                "mpp": float(metres_per_pixel),
                "ppw": ppw,
                "origin": origin,
                "dy": int(dy),
                "dx": int(dx),
            }
    return best


def main():
    art_path = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "real_map.jpeg")
    rings, source_name = osm_building_rings()
    print(f"{len(rings)} OSM rings from {source_name}")

    # Anchor the rasteriser on the centroid of the rings; the shift search moves it.
    all_x = [x for ring in rings for x, _ in ring]
    all_y = [y for ring in rings for _, y in ring]
    centre = ((min(all_x) + max(all_x)) / 2, (min(all_y) + max(all_y)) / 2)

    # Coarse: find the ballpark cheaply.
    mask, (full_w, full_h), work_scale = building_mask_from_art(art_path, WORK_WIDTH)
    size = (mask.shape[1], mask.shape[0])
    print(f"art {full_w}x{full_h}; coarse pass at {size[0]}x{size[1]}")
    coarse = search(mask, rings, work_scale, size, centre,
                    np.linspace(MIN_MPP, MAX_MPP, SCALE_STEPS))
    if not coarse:
        print("FAILED: no scale produced a usable raster")
        sys.exit(1)
    print(f"  coarse: {coarse['mpp']:.4f} m/px, overlap {coarse['score']:.3f}")

    # Refine: the coarse answer is quantised far too loosely to put outlines on buildings.
    mask, _, work_scale = building_mask_from_art(art_path, REFINE_WIDTH)
    size = (mask.shape[1], mask.shape[0])
    span = coarse["mpp"] * REFINE_SCALE_SPAN
    print(f"  refining at {size[0]}x{size[1]} over +/-{span:.4f} m/px")
    best = search(mask, rings, work_scale, size, centre,
                  np.linspace(coarse["mpp"] - span, coarse["mpp"] + span, REFINE_SCALE_STEPS))
    if not best or best["score"] < 0.2:
        print("FAILED: refinement found no trustworthy fit")
        sys.exit(1)
    print(f"  refined: {best['mpp']:.4f} m/px, overlap {best['score']:.3f}")

    # A shift of (dx, dy) means the rasterised world sat that far from where it belongs.
    ppw = best["ppw"]
    ox = best["origin"][0] - best["dx"] / ppw
    oy = best["origin"][1] - best["dy"] / ppw
    full_ppw = ppw / work_scale
    north, west = inverse_mercator(ox, oy)
    south, east = inverse_mercator(ox + full_w / full_ppw, oy + full_h / full_ppw)

    result = {
        "art": art_path.name,
        "image": {"width": full_w, "height": full_h},
        "bounds": {"south": south, "west": west, "north": north, "east": east},
        "metresPerPixel": round(best["mpp"] * math.cos(math.radians((north + south) / 2)), 4),
        "overlap": round(best["score"], 4),
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"bounds  {south:.6f},{west:.6f} .. {north:.6f},{east:.6f}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
