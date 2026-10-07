import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  plugins: [
    react(),
    tailwindcss(),
    // Self-signed HTTPS for `npm run dev -- --host`: phones only expose the camera on secure origins.
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-icon-180.png'],
      manifest: {
        name: 'Tathva Campus Map',
        short_name: 'Tathva Map',
        description: 'Offline campus map and navigation for Tathva @ NIT Calicut',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: JS/CSS/HTML, the Leaflet marker PNGs, the pixel-art map image and the
        // bundled pixel fonts (woff2 only: every browser that runs the service worker supports it).
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest,woff2}'],
        // The real map art may be large; the 2 MiB default would silently skip precaching it.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Never serve the app shell for API or admin URLs.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin/],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
