import type L from 'leaflet'
import { imagePoint, imagePointOf } from '../config/mapConfig'
import type { Emblem } from '../data/emblems'

/**
 * The rectangle to draw an emblem in, as a pair of corners on the map.
 *
 * Worked out in the art's own pixels and projected at the end, which is how every other shape
 * in this app is placed: `imagePoint` is the one hinge between the picture and the world, so a
 * recalibration moves the emblem with its building instead of leaving it behind.
 *
 * Fitted to the footprint's bounding box rather than the footprint itself, because a building
 * traced as an L still wants its logo in the middle of the box, and shrunk by `fill` so the
 * mark sits inside the walls — and, at this size, so the building's printed name still reads
 * through it.
 *
 * Web Mercator stretches latitude, so the drawn rectangle comes out about 1% taller than the
 * file at this latitude. That is invisible, and correcting it would mean projecting at a zoom
 * the layer does not know.
 */
export function emblemBounds(polygon: L.LatLngTuple[], emblem: Emblem): L.LatLngBoundsExpression {
  const pixels = polygon.map(([lat, lng]) => imagePointOf({ lat, lng }))
  const xs = pixels.map(([x]) => x)
  const ys = pixels.map(([, y]) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)

  // The widest rectangle of the file's own shape that fits the box: never stretched to fill it.
  const width = Math.min(right - left, (bottom - top) * emblem.aspect) * emblem.fill
  const height = width / emblem.aspect
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return [
    imagePoint(cx - width / 2, cy - height / 2),
    imagePoint(cx + width / 2, cy + height / 2),
  ]
}
