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
  label: string
}

export const emblems: Record<string, Emblem> = {
  department_of_architecture_and_plannning: {
    src: dapEmblem,
    aspect: 0.9277,
    fill: 0.70,
    label: 'Department of Architecture & Planning',
  },
}
