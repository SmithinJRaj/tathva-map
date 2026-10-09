import type L from 'leaflet'

/** About half the map's height, clamped, so long popups scroll instead of running off-screen. */
export function popupMaxHeight(map: L.Map): number {
  return Math.min(360, Math.max(200, Math.round(map.getSize().y / 2)))
}
