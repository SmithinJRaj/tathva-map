#!/usr/bin/env python3
"""
Recolours the campus art into the app's violet night palette.

    python3 scripts/style-basemap.py real_map.jpeg src/assets/map/nitc-campus.webp

The art is flat-shaded, so a straight colour swap is tempting, but it cannot tell a label
from a building outline - both are dark - and swapping them together leaves the labels
unreadable. Instead each pixel is classified by saturation and hue into one of four
families, and only its lightness carries over:

  ink       labels and the darkest detail    -> bright, so text stays readable wherever it
                                                sits. Caught by absolute darkness before
                                                anything else, because text drawn over a
                                                building picks up its hue at the edges and
                                                would otherwise be classified as building
  neutral   background and grey detail       -> lightness INVERTED, so the pale ground goes
                                                to deep space
  building  the salmon blocks                -> violet ramp
  road      the tan ribbons                  -> lavender ramp, kept the brightest structure
                                                on the map so routes have something to sit on
  green     pitches, parks, lawns            -> a muted green that still reads as planting

Within a family the original light-to-dark ordering is preserved, so building outlines stay
darker than building fills and road casings stay darker than road centres.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Target ramps, each as (dark end, light end) in RGB.
BACKGROUND = (0x12, 0x0C, 0x26)
INK = (0xEC, 0xE7, 0xFF)
BUILDING = ((0x26, 0x18, 0x47), (0x50, 0x3D, 0x79))
ROAD = ((0x6A, 0x5A, 0x96), (0xB8, 0xA7, 0xE2))
GREEN = ((0x24, 0x5C, 0x46), (0x47, 0xA8, 0x78))

# Palette size when saving PNG. Flat art, so this is visually lossless.
PALETTE_SIZE = 128

# WebP quality. The art is flat fills and 8px labels, which is where lossy encoding shows
# first, so this was checked at 4x magnification rather than taken on trust: at 82 the labels
# are indistinguishable from the PNG and the whole-image RMSE is about 1%. It is worth the
# care because this one file is roughly three quarters of what a first visit downloads.
WEBP_QUALITY = 82

# Anything darker than this is type. The darkest thing that is not type is the building
# outline, at a lightness of about 0.47, so there is plenty of room between them.
INK_LIGHTNESS = 0.32

# Saturation below this is grey: the ground and the thin grey detail.
NEUTRAL_SATURATION = 0.06
# Above this a warm pixel is a building rather than a road.
BUILDING_SATURATION = 0.33


def lerp(ramp, t):
    """t in [0, 1] along a (dark, light) ramp, broadcast over an image."""
    dark = np.array(ramp[0], dtype=np.float32)
    light = np.array(ramp[1], dtype=np.float32)
    return dark + (light - dark) * t[..., None]


def normalise(values, mask):
    """Spreads the values inside a mask across [0, 1], so each family uses its whole ramp."""
    out = np.zeros_like(values)
    if not mask.any():
        return out
    inside = values[mask]
    low, high = np.percentile(inside, 2), np.percentile(inside, 98)
    if high - low < 1e-6:
        out[mask] = 0.5
        return out
    out[mask] = np.clip((inside - low) / (high - low), 0.0, 1.0)
    return out


def main():
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    rgb = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32) / 255.0
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    lightness = (high + low) / 2
    chroma = high - low
    saturation = np.where(high > 1e-6, chroma / np.maximum(high, 1e-6), 0.0)

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Hue only has to separate green from warm, so the cheap test is enough.
    greenish = (g > r) & (g > b)

    ink = lightness < INK_LIGHTNESS
    neutral = ~ink & (saturation < NEUTRAL_SATURATION)
    green = ~ink & ~neutral & greenish
    warm = ~ink & ~neutral & ~greenish
    building = warm & (saturation >= BUILDING_SATURATION)
    road = warm & (saturation < BUILDING_SATURATION)

    out = np.zeros_like(rgb)

    # Type, lifted clear of whatever it is drawn over.
    out[ink] = np.array(INK, dtype=np.float32) / 255.0

    # Neutral: invert, so the pale ground drops to deep space.
    out[neutral] = lerp((INK, BACKGROUND), lightness)[neutral] / 255.0

    for mask, ramp in ((building, BUILDING), (road, ROAD), (green, GREEN)):
        t = normalise(lightness, mask)
        out[mask] = lerp(ramp, t)[mask] / 255.0

    image = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
    if dst.suffix == ".webp":
        # No palette step here: quantising before a lossy encoder only gives it banded input
        # to encode, costing quality without saving bytes. method=6 is the slowest, smallest
        # setting, which is free when this runs once per art change.
        image.save(dst, quality=WEBP_QUALITY, method=6)
    else:
        # The result is a handful of flat fills plus anti-aliasing, so a small palette is
        # visually lossless and keeps the file well under the precache size limit.
        image.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT).save(dst, optimize=True)
    total = rgb.shape[0] * rgb.shape[1]
    print(f"{src.name} -> {dst}")
    for name, mask in (
        ("ink", ink),
        ("neutral", neutral),
        ("building", building),
        ("road", road),
        ("green", green),
    ):
        print(f"  {name:9} {100 * mask.sum() / total:5.1f}%")


if __name__ == "__main__":
    main()
