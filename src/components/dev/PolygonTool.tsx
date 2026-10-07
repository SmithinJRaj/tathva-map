import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { CircleMarker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import { imagePointOf } from '../../config/mapConfig'

// DEV ONLY. CampusMap loads this behind `import.meta.env.DEV`, so it never ships in production.

interface Props {
  active: boolean
  onActiveChange: (active: boolean) => void
}

const DRAFT_STYLE: L.PathOptions = { color: '#ff00ff', weight: 2, dashArray: '6 4', fillOpacity: 0.15 }

/**
 * Formats vertices as the `[[x, y], ...]` image-pixel literal that buildings.ts and
 * routingGraph.ts store, so a trace survives re-calibrating MAP_BOUNDS.
 */
function formatPolygon(vertices: L.LatLngTuple[]): string {
  const rows = vertices.map(([lat, lng]) => {
    const [x, y] = imagePointOf(L.latLng(lat, lng))
    return `  [${Math.round(x)}, ${Math.round(y)}],`
  })
  return `[\n${rows.join('\n')}\n]`
}

export function PolygonTool({ active, onActiveChange }: Props) {
  const map = useMap()
  const panelRef = useRef<HTMLDivElement>(null)
  const [vertices, setVertices] = useState<L.LatLngTuple[]>([])
  const [status, setStatus] = useState('')

  // The panel sits inside the map container: stop its clicks/scrolls from reaching the map.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    L.DomEvent.disableClickPropagation(panel)
    L.DomEvent.disableScrollPropagation(panel)
  }, [])

  // Quick successive clicks would otherwise double-click-zoom while tracing.
  useEffect(() => {
    if (!active) return
    const container = map.getContainer()
    map.doubleClickZoom.disable()
    container.classList.add('trace-mode')
    return () => {
      map.doubleClickZoom.enable()
      container.classList.remove('trace-mode')
    }
  }, [map, active])

  useMapEvents({
    click(e) {
      if (!active) return
      setVertices((v) => [...v, [e.latlng.lat, e.latlng.lng]])
    },
  })

  const copy = async () => {
    const text = formatPolygon(vertices)
    console.log(`[PolygonTool] ${vertices.length} vertices:\n${text}`)
    try {
      await navigator.clipboard.writeText(text)
      setStatus(`Copied ${vertices.length} vertices`)
    } catch {
      setStatus('Clipboard blocked: see console')
    }
  }

  return (
    <>
      {vertices.length >= 3 ? (
        <Polygon positions={vertices} pathOptions={DRAFT_STYLE} interactive={false} />
      ) : (
        vertices.length === 2 && <Polyline positions={vertices} pathOptions={DRAFT_STYLE} interactive={false} />
      )}
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={4}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#ff00ff', fillOpacity: 1 }}
          interactive={false}
        />
      ))}

      <div
        ref={panelRef}
        className="absolute top-1/2 left-3 z-[1000] w-44 -translate-y-1/2 space-y-2 border-2 border-white bg-black/85 p-2 font-mono text-xs text-white"
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => onActiveChange(e.target.checked)} />
          Trace mode
        </label>
        <p className="text-slate-400">{vertices.length} vertices</p>
        <div className="flex gap-1">
          <button
            type="button"
            className="flex-1 rounded bg-slate-700 px-1 py-1 disabled:opacity-40"
            disabled={vertices.length === 0}
            onClick={() => setVertices((v) => v.slice(0, -1))}
          >
            Undo
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-slate-700 px-1 py-1 disabled:opacity-40"
            disabled={vertices.length === 0}
            onClick={() => {
              setVertices([])
              setStatus('')
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-fuchsia-700 px-1 py-1 disabled:opacity-40"
            disabled={vertices.length < 3}
            onClick={copy}
          >
            Copy
          </button>
        </div>
        {status && <p className="text-fuchsia-300">{status}</p>}
      </div>
    </>
  )
}
