// Leaflet resolves its default marker images from the CSS file's URL at runtime,
// which breaks once Vite fingerprints and relocates assets. Import the images so
// Vite bundles them, then point L.Icon.Default at the resolved URLs.
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
})
