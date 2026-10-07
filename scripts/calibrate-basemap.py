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

# The salmon the art fills buildings with, and how far a pixel may stray and still count.
BUILDING_RGB = (221, 112, 109)
COLOUR_TOLERANCE = 46

# Work at this width; registration does not need full resolution and the FFTs stay quick.
WORK_WIDTH = 512

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


def building_mask_from_art(path):
    """Binary mask of the drawn buildings, plus the scale it was reduced by."""
    img = Image.open(path).convert("RGB")
    full_w, full_h = img.size
    scale = WORK_WIDTH / full_w
    small = img.resize((WORK_WIDTH, max(1, round(full_h * scale))), Image.BILINEAR)
    arr = np.asarray(small).astype(np.int16)
    target = np.array(BUILDING_RGB, dtype=np.int16)
    distance = np.sqrt(((arr - target) ** 2).sum(axis=2))
    return (distance < COLOUR_TOLERANCE).astype(np.float32), (full_w, full_h), scale


def osm_building_rings():
    source = OSM_WIDE if OSM_WIDE.exists() else OSM_CACHE
    data = json.loads(source.read_text())
    rings = []
    for el in data["elements"]:
        if el.get("type") != "way" or "building" not in el.get("tags", {}):
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


def main():
    art_path = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "real_map.jpeg")
    mask, (full_w, full_h), work_scale = building_mask_from_art(art_path)
    size = (mask.shape[1], mask.shape[0])
    rings, source_name = osm_building_rings()
    print(f"art {full_w}x{full_h}, working at {size[0]}x{size[1]}")
    print(f"{len(rings)} OSM building rings from {source_name}")
    print(f"art building pixels: {mask.sum():.0f}")

    # Anchor the rasteriser on the centroid of the OSM buildings; the shift search moves it.
    all_x = [x for ring in rings for x, _ in ring]
    all_y = [y for ring in rings for _, y in ring]
    centre = ((min(all_x) + max(all_x)) / 2, (min(all_y) + max(all_y)) / 2)

    equator_m = 40075016.686
    best = None
    for metres_per_pixel in np.linspace(MIN_MPP, MAX_MPP, SCALE_STEPS):
        # Metres per pixel is quoted at the equator, matching how web map scales are stated.
        full_ppw = equator_m / metres_per_pixel / equator_m * (equator_m / metres_per_pixel)
        full_ppw = equator_m / metres_per_pixel  # world width in pixels
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

    if not best or best["score"] < 0.2:
        print(f"FAILED: best overlap only {best['score']:.3f} - the fit is not trustworthy")
        sys.exit(1)

    # A shift of (dx, dy) means the rasterised world sat that far from where it belongs.
    ppw = best["ppw"]
    ox = best["origin"][0] - best["dx"] / ppw
    oy = best["origin"][1] - best["dy"] / ppw
    full_ppw = ppw / work_scale
    west_x, north_y = ox, oy
    east_x = ox + full_w / full_ppw
    south_y = oy + full_h / full_ppw

    north, west = inverse_mercator(west_x, north_y)
    south, east = inverse_mercator(east_x, south_y)

    result = {
        "art": art_path.name,
        "image": {"width": full_w, "height": full_h},
        "bounds": {"south": south, "west": west, "north": north, "east": east},
        "metresPerPixel": round(best["mpp"] * math.cos(math.radians((north + south) / 2)), 4),
        "overlap": round(best["score"], 4),
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"overlap {best['score']:.3f} at {result['metresPerPixel']} m/px")
    print(f"bounds  {south:.6f},{west:.6f} .. {north:.6f},{east:.6f}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
