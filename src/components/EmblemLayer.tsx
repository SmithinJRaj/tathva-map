import type L from 'leaflet'
import { ImageOverlay, Pane } from 'react-leaflet'
import { placesById } from '../data/campus'
import { emblems } from '../data/emblems'
import { emblemBounds } from './emblemBounds'

/** Above the place tints (350) so the mark is not washed by them, below the markers (600). */
export const EMBLEMS_PANE = 'emblems'

/**
 * Logos laid over their buildings. Decoration, so every one is `interactive={false}`: a tap
 * here has to reach the building underneath and open its popup, exactly as if the mark were
 * painted on the roof.
 */
export function EmblemLayer() {
  return (
    <Pane name={EMBLEMS_PANE} style={{ zIndex: 360, pointerEvents: 'none' }}>
      {Object.entries(emblems).map(([placeId, emblem]) => {
        const place = placesById.get(placeId)
        if (!place?.polygon) {
          if (import.meta.env.DEV) {
            console.warn(`emblems: "${placeId}" has no outline to sit on, so it is not drawn`)
          }
          return null
        }
        return (
          <ImageOverlay
            key={placeId}
            url={emblem.src}
            bounds={emblemBounds(place.polygon, emblem)}
            className="place-emblem"
            alt={emblem.label}
            interactive={false}
            eventHandlers={
              import.meta.env.DEV
                ? {
                    // The rectangle was computed from a ratio written down by hand; if the asset
                    // is rebuilt to a different crop, say so rather than quietly skewing the mark.
                    load: (e) => {
                      const img = (e.target as L.ImageOverlay).getElement()
                      if (!img?.naturalWidth) return
                      const real = img.naturalWidth / img.naturalHeight
                      if (Math.abs(real - emblem.aspect) > 0.01) {
                        console.warn(
                          `emblems: "${placeId}" aspect is ${real.toFixed(4)} but data says ${emblem.aspect}; the mark is skewed`,
                        )
                      }
                    },
                  }
                : undefined
            }
          />
        )
      })}
    </Pane>
  )
}
