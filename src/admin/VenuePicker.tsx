import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { ImageOverlay, MapContainer, Marker, Polygon, useMap } from 'react-leaflet'
import { knownPlaces } from '../../shared/places.ts'
import { MAP_BOUNDS, MAP_IMAGE_URL } from '../config/mapConfig.ts'
import { hostPlaceId, placesById } from '../data/campus.ts'

interface Props {
  value: string | null
  onChange: (id: string) => void
}

const allPlaces = [...knownPlaces.entries()]
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Re-frames the preview whenever the selection changes. */
function Frame({ position, polygon }: { position: L.LatLngTuple; polygon: L.LatLngTuple[] | null }) {
  const map = useMap()
  useEffect(() => {
    if (polygon) map.fitBounds(L.latLngBounds(polygon), { padding: [16, 16], maxZoom: 19, animate: false })
    else map.setView(position, 19, { animate: false })
  }, [map, position, polygon])
  return null
}

/** A 200 px, non-interactive look at where the chosen venue sits on campus. */
function Preview({ placeId }: { placeId: string }) {
  // An indoor room has no outline of its own: show the building it is in.
  const place = placesById.get(hostPlaceId(placeId))
  if (!place) return <p className="term admin-note venue-preview-empty">No map position for this venue</p>
  return (
    <MapContainer
      className="space-bg venue-preview"
      center={place.position}
      zoom={19}
      dragging={false}
      touchZoom={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
      attributionControl={false}
    >
      <ImageOverlay url={MAP_IMAGE_URL} bounds={MAP_BOUNDS} />
      {place.polygon ? (
        <Polygon positions={place.polygon} interactive={false} className="venue-outline" />
      ) : (
        <Marker position={place.position} interactive={false} keyboard={false} />
      )}
      <Frame position={place.position} polygon={place.polygon} />
    </MapContainer>
  )
}

export function VenuePicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? allPlaces.filter((p) => p.name.toLowerCase().includes(q)) : allPlaces
  }, [query])

  return (
    <div className="venue-picker">
      <label className="field">
        <span className="field-tag pix-sm">Venue</span>
        <input
          className="term"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={value ? (knownPlaces.get(value) ?? value) : 'Search venues'}
          aria-label="Search venues"
        />
      </label>
      <ul className="venue-list">
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="venue-option term"
              aria-pressed={p.id === value}
              onClick={() => onChange(p.id)}
            >
              {p.name}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="term admin-note">No venue matches.</li>}
      </ul>
      {value && <Preview placeId={value} />}
    </div>
  )
}
