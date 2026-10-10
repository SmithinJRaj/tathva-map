"""Turns a logo into a map emblem: white mark, transparent everywhere else.

    python3 scripts/build-emblem.py logo.avif src/assets/map/dap-emblem.webp

The logo as supplied is a white mark on *opaque black*, not on transparency, so laying it over
the map directly would paste a black square across the building. There is no alpha channel to
use, so this keys the background out by luminance: the mark is the bright pixels, and how bright
a pixel is becomes how opaque it is. That keeps the anti-aliased edges soft instead of giving
the mark a hard jagged outline, which a simple threshold would.

The mark is left white rather than tinted. The map art is recoloured by script and the interface
is coloured by CSS, and an emblem belongs to the interface: `.place-emblem` in styles/retro.css
is what makes it glow, so the colour can change without rebuilding the asset.

Cropped to the mark and scaled down, because the source is 1920 square with most of it empty and
the emblem is drawn across a building perhaps 200 pixels wide. WebP so the service worker
precaches it: `globPatterns` in vite.config.ts does not list avif.

Needs Pillow. AVIF input is decoded with ffmpeg when Pillow lacks the plugin, which is the usual
case on a plain install.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

# Retina headroom over the ~200 px the building spans on screen, without carrying 1920 square.
MAX_SIDE = 512
# A little air so the glow has somewhere to fall off rather than clipping at the edge.
MARGIN_FRACTION = 0.04
WEBP_QUALITY = 88


def load(path: Path) -> Image.Image:
    try:
        return Image.open(path).convert("RGB")
    except Exception:
        # Pillow without the AVIF plugin. ffmpeg reads it and is already a dependency of
        # nothing here, so fail loudly rather than silently producing a worse asset.
        with tempfile.TemporaryDirectory() as tmp:
            decoded = Path(tmp) / "decoded.png"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-i", str(path), str(decoded)],
                check=True,
            )
            return Image.open(decoded).convert("RGB")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    source, target = Path(sys.argv[1]), Path(sys.argv[2])

    image = load(source)
    # Luminance is the alpha: black background to nothing, the white mark to solid, and the
    # grey pixels along every edge to exactly the partial opacity they already looked like.
    alpha = image.convert("L")
    box = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        print(f"{source} is blank — nothing to key out.")
        return 1

    white = Image.new("RGBA", image.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    emblem = white.crop(box)

    margin = round(max(emblem.size) * MARGIN_FRACTION)
    padded = Image.new("RGBA", (emblem.width + margin * 2, emblem.height + margin * 2), (255, 255, 255, 0))
    padded.paste(emblem, (margin, margin))

    scale = MAX_SIDE / max(padded.size)
    if scale < 1:
        padded = padded.resize(
            (round(padded.width * scale), round(padded.height * scale)), Image.LANCZOS
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    padded.save(target, "WEBP", quality=WEBP_QUALITY, method=6)

    print(f"{source} {image.size[0]}x{image.size[1]}  ->  {target} {padded.width}x{padded.height}")
    print(f"{target.stat().st_size / 1024:.1f} KiB")
    print(f"aspect {padded.width / padded.height:.4f}  (the overlay must match this or the mark skews)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
