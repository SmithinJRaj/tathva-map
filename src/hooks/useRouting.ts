import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { placesById } from '../data/campus'
import { buildAdjacency, findRoute, type RouteResult } from '../lib/astar'
import { graph, type TravelMode } from '../lib/graph'

// One adjacency per mode, built once: dropping the footpaths is what keeps a driving route
// on the roads, so the two modes genuinely search different networks.
const adjacency: Record<TravelMode, ReturnType<typeof buildAdjacency>> = {
  walk: buildAdjacency(graph, 'walk'),
  drive: buildAdjacency(graph, 'drive'),
}

/**
 * Each route is three lines: a wide translucent halo that reads as glow on the night map,
 * a dark casing to separate it from whatever it crosses, and the coloured core on top.
 * Walking is dashed, like the footpaths it uses; driving is solid.
 */
const HALO: L.PolylineOptions = {
  color: '#a78bfa',
  weight: 18,
  opacity: 0.22,
  lineCap: 'round',
  lineJoin: 'round',
}

const CASING: L.PolylineOptions = {
  color: '#0b0718',
  weight: 11,
  opacity: 0.9,
  lineCap: 'butt',
  lineJoin: 'round',
}

const CORE: Record<TravelMode, L.PolylineOptions> = {
  walk: {
    color: '#fbbf24',
    weight: 5,
    opacity: 1,
    lineCap: 'butt',
    lineJoin: 'round',
    dashArray: '2 9',
  },
  drive: { color: '#67e8f9', weight: 5, opacity: 1, lineCap: 'butt', lineJoin: 'round' },
}

/** Rough campus speeds in metres per minute: a brisk walk, and a careful drive. */
const SPEED: Record<TravelMode, number> = { walk: 80, drive: 300 }

export const minutesFor = (metres: number, mode: TravelMode) =>
  Math.max(1, Math.round(metres / SPEED[mode]))

/**
 * A place's routing node for this mode. Each place is snapped to both networks at build
 * time, so a driver is sent to the nearest node a car can reach — the far side of a
 * pedestrian zone, or the host building's entrance for a room upstairs — rather than being
 * told there is no route at all.
 */
function nodeFor(placeId: string | null, mode: TravelMode): string | null {
  const place = placeId ? placesById.get(placeId) : undefined
  if (!place) return null
  return mode === 'drive' ? place.driveNodeId : place.nodeId
}

/**
 * Computes a route between two places and draws it straight onto the Leaflet map. The
 * polylines live in a ref, not React state, so redraws never trigger a React render.
 * Must be called inside a <MapContainer>.
 */
export function useRouting(
  startPlaceId: string | null,
  goalPlaceId: string | null,
  mode: TravelMode,
): RouteResult | null {
  const map = useMap()
  const linesRef = useRef<L.Polyline[]>([])

  const route = useMemo(() => {
    const from = nodeFor(startPlaceId, mode)
    const to = nodeFor(goalPlaceId, mode)
    if (!from || !to || from === to) return null
    return findRoute(graph, from, to, adjacency[mode])
  }, [startPlaceId, goalPlaceId, mode])

  useEffect(() => {
    if (!route) return

    const latLngs = route.path.map((n) => L.latLng(n.lat, n.lng))
    const lines = [
      L.polyline(latLngs, HALO),
      L.polyline(latLngs, CASING),
      L.polyline(latLngs, CORE[mode]),
    ]
    for (const line of lines) line.addTo(map)
    linesRef.current = lines
    map.fitBounds(lines[0].getBounds(), { padding: [56, 56], maxZoom: 18 })

    return () => {
      for (const line of linesRef.current) line.remove()
      linesRef.current = []
    }
  }, [map, route, mode])

  return route
}
