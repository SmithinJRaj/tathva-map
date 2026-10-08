import L from 'leaflet'
import type { PlaceCategory } from '../data/campus'

// Leaflet's default pin is a smooth blue teardrop, which fights everything else on screen.
// These are divIcons instead: square, bordered, drawn entirely by styles/retro.css.

const cache = new Map<string, L.DivIcon>()

/** A small square chip in the place's category colour. */
export function placeIcon(category: PlaceCategory, live = false): L.DivIcon {
  const key = `place:${category}:${live}`
  let icon = cache.get(key)
  if (!icon) {
    icon = L.divIcon({
      className: live ? 'place-live' : '',
      html: `<div class="pin pin-${category}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    })
    cache.set(key, icon)
  }
  return icon
}

/**
 * The red beacon over a venue with something live. Anchored below and left of its centre so it
 * sits up and to the right of the point, clear of the building's label or a point venue's pin.
 */
export function liveDotIcon(): L.DivIcon {
  let icon = cache.get('live-dot')
  if (!icon) {
    icon = L.divIcon({
      className: 'live-beacon-icon',
      html: '<span class="live-beacon"></span>',
      iconSize: [10, 10],
      iconAnchor: [-6, 16],
    })
    cache.set('live-dot', icon)
  }
  return icon
}

/** The labelled flag for the two ends of a route. */
export function endpointIcon(kind: 'start' | 'goal'): L.DivIcon {
  const key = `end:${kind}`
  let icon = cache.get(key)
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<span class="pin-flag is-${kind}">${kind === 'start' ? 'YOU' : 'GOAL'}</span>`,
      // Anchored at the foot of the stem, so the flag floats clear above the point.
      iconSize: [46, 20],
      iconAnchor: [4, 31],
      popupAnchor: [19, -34],
    })
    cache.set(key, icon)
  }
  return icon
}
