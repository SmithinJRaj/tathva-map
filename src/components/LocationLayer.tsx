import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { Circle, Marker, Pane, useMap } from 'react-leaflet'
import type { Fix } from '../hooks/useGeolocation'

/**
 * The live position: a dot, and a circle showing how sure the device is. Drawing the
 * accuracy honestly matters here — a bare dot on a campus map implies a precision phone GPS
 * does not have, and someone will trust it into the wrong building.
 */
const ACCURACY_STYLE: L.PathOptions = {
  color: '#67e8f9',
  weight: 1,
  opacity: 0.5,
  fillColor: '#67e8f9',
  fillOpacity: 0.12,
}

const dotIcon = (heading: number | null) =>
  L.divIcon({
    className: '',
    html:
      heading === null
        ? '<div class="live-dot"></div>'
        : `<div class="live-dot has-heading" style="--heading:${heading}deg"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

interface Props {
  fix: Fix | null
  /** Keeps the map centred on the user while navigating. */
  follow: boolean
}

export function LocationLayer({ fix, follow }: Props) {
  const map = useMap()
  // Panning on every fix would fight the user the moment they drag the map themselves, so
  // only follow while the flag is on, and only when the dot has actually left the middle.
  const lastPanRef = useRef(0)

  useEffect(() => {
    if (!follow || !fix) return
    const now = Date.now()
    if (now - lastPanRef.current < 1500) return
    const point = L.latLng(fix.lat, fix.lng)
    if (map.getBounds().pad(-0.3).contains(point)) return
    lastPanRef.current = now
    map.panTo(point, { animate: true, duration: 0.8 })
  }, [map, fix, follow])

  if (!fix) return null
  const position: L.LatLngExpression = [fix.lat, fix.lng]
  return (
    <Pane name="location" style={{ zIndex: 640 }}>
      {fix.accuracy > 0 && (
        <Circle center={position} radius={fix.accuracy} pathOptions={ACCURACY_STYLE} interactive={false} />
      )}
      <Marker position={position} icon={dotIcon(fix.heading)} interactive={false} zIndexOffset={500} />
    </Pane>
  )
}
