import dapEmblem from '../assets/map/dap-emblem.webp'

/**
 * A logo laid over a building on the map.
 *
 * Built by `scripts/build-emblem.py`, which keys the background out of a logo supplied as a
 * white mark on opaque black and prints the aspect ratio of what it produced. That ratio is
 * recorded here because the overlay's rectangle is computed before the image has loaded, and a
 * rectangle that does not match the file stretches the mark. `EmblemLayer` checks the two
 * agree once the image is in, and says so in development if they have drifted.
 */
export interface Emblem {
  src: string
  /** Width ÷ height of the file, as the build script reports it. */
  aspect: number
  /** How much of the building's footprint the mark spans, at its widest. */
  fill: number
  /**
   * Where in the footprint's bounding box the mark's centre sits, as `[x, y]` fractions —
   * `[0.5, 0.5]`, the default, is the middle. Use it to keep the mark off the name the map art
   * already prints across the building. Clamped so the mark cannot leave the box.
   */
  anchor?: [number, number]
  label: string
}

export const emblems: Record<string, Emblem> = {
  department_of_architecture_and_plannning: {
    src: dapEmblem,
    aspect: 0.9277,
    // The art prints "Dept. of Architecture & Planning" across the middle of this footprint, so
    // the mark goes in the clear lower wing instead of over the lettering. Small, because that
    // wing is what is left: the largest square-ish rectangle that fits inside those walls below
    // the text, with a few pixels of margin, is about a third of the footprint's width.
    fill: 0.34,
    anchor: [0.56, 0.76],
    label: 'Department of Architecture & Planning',
  },
}
