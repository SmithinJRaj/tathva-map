import type { Manoeuvre, NavState } from '../lib/navigation'
import type { TravelMode } from '../lib/graph'
import { minutesFor } from '../hooks/useRouting'

/** Arrow glyphs, drawn rather than typed so they match the rest of the pixel chrome. */
const ARROWS: Record<Manoeuvre, string> = {
  start: 'M8 1l5 6H10v8H6V7H3z',
  straight: 'M8 1l5 6H10v8H6V7H3z',
  'slight-left': 'M4 2h6v3H7.5l5 5-2.5 2.5-5-5V13H2V4z',
  left: 'M1 8l6-5v3h8v4H7v3z',
  'sharp-left': 'M2 9l5-5v3h4a3 3 0 013 3v5h-4v-4a1 1 0 00-1-1H7v3z',
  'slight-right': 'M12 2H6v3h2.5l-5 5L6 12.5l5-5V13h3V4z',
  right: 'M15 8l-6-5v3H1v4h8v3z',
  'sharp-right': 'M14 9L9 4v3H5a3 3 0 00-3 3v5h4v-4a1 1 0 011-1h2v3z',
  arrive: 'M8 1a5 5 0 015 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 015-5zm0 3a2 2 0 100 4 2 2 0 000-4z',
}

/** Metres read oddly below about 20; round them so the number stops twitching. */
function metres(value: number): string {
  if (value < 20) return `${Math.round(value / 5) * 5} m`
  if (value < 1000) return `${Math.round(value / 10) * 10} m`
  return `${(value / 1000).toFixed(1)} km`
}

interface Props {
  /**
   * Null once the destination is underfoot: the route collapses to nothing when start and
   * goal snap to the same node, so arrival is the one state with no route behind it.
   */
  nav: NavState | null
  arrived: boolean
  mode: TravelMode
  destination: string
  recalculating: boolean
  onStop: () => void
}

export function NavPanel({ nav, arrived, mode, destination, recalculating, onStop }: Props) {
  const manoeuvre = arrived || !nav ? 'arrive' : nav.step.manoeuvre
  return (
    <div className="slab nav-panel pointer-events-auto mx-auto flex max-w-md items-center gap-3 p-2.5">
      <span className={`nav-arrow ${manoeuvre === 'arrive' ? 'is-arrived' : ''}`} aria-hidden>
        <svg viewBox="0 0 16 16" className="h-6 w-6" fill="currentColor">
          <path d={ARROWS[manoeuvre]} />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="pix nav-instruction">
          {arrived || !nav ? `Arrived at ${destination}` : nav.step.text}
        </p>
        <p className="term nav-detail">
          {recalculating
            ? 'Off route — finding a new way…'
            : arrived || !nav
              ? 'You are here'
              : `${metres(nav.distanceToStep)} · then ${metres(nav.remaining)} to go`}
        </p>
      </div>

      {!arrived && nav && (
        <p className="pix-sm nav-eta" aria-label="Estimated time remaining">
          {minutesFor(nav.remaining, mode)}
          <span className="nav-eta-unit">min</span>
        </p>
      )}

      <button type="button" className="btn btn-ghost" onClick={onStop}>
        {arrived || !nav ? 'Done' : 'Stop'}
      </button>
    </div>
  )
}
