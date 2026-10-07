import type L from 'leaflet'

// Place id -> its polygon or marker, so other parts of the app can find the layer to open.
const layers = new Map<string, L.Layer>()

export function registerPlaceLayer(id: string, layer: L.Layer | null): void {
  if (layer) layers.set(id, layer)
  else layers.delete(id)
}

export function getPlaceLayer(id: string): L.Layer | undefined {
  return layers.get(id)
}
