import { useState } from 'react'
import type { PlaceCategory } from '../data/campus'

const SWATCH: Record<PlaceCategory, string> = {
  academic: 'var(--cat-academic)',
  food: 'var(--cat-food)',
  event: 'var(--cat-event)',
  amenity: 'var(--cat-amenity)',
  other: 'var(--cat-other)',
}

interface Props {
  order: PlaceCategory[]
  labels: Record<PlaceCategory, string>
  hidden: ReadonlySet<PlaceCategory>
  onToggle: (category: PlaceCategory) => void
}

/**
 * Doubles as the key to the outline colours and as a filter: with ninety-odd places on a
 * phone screen, being able to drop everything but food is the difference between a map you
 * can read and a wall of boxes. Collapsed by default so it never fights the map for space.
 */
export function Legend({ order, labels, hidden, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const activeFilters = hidden.size

  return (
    <div
      className="absolute left-3 z-[1000] flex flex-col items-start gap-1.5"
      style={{ bottom: 'calc(56px + 20px)' }}
    >
      {open && (
        <div className="slab flex flex-col items-start gap-1 p-1.5">
          {order.map((category) => {
            const shown = !hidden.has(category)
            return (
              <button
                key={category}
                type="button"
                className="chip"
                aria-pressed={shown}
                onClick={() => onToggle(category)}
              >
                <span
                  className="chip-swatch"
                  style={{ background: SWATCH[category], color: SWATCH[category] }}
                />
                {labels[category]}
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
          <path d="M1 2h6v6H1V2zm8 0h6v6H9V2zM1 10h6v4H1v-4zm8 0h6v4H9v-4z" />
        </svg>
        Layers
        {activeFilters > 0 && <span style={{ color: 'var(--red)' }}>·{activeFilters}</span>}
      </button>
    </div>
  )
}
