import 'leaflet/dist/leaflet.css'
import './lib/leafletIconFix'
import '@fontsource/press-start-2p/latin-400.css'
import '@fontsource/vt323/latin-400.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { ScheduleProvider } from './schedule/ScheduleContext.tsx'

registerSW({ immediate: true })

const root = createRoot(document.getElementById('root')!)

if (location.pathname.startsWith('/admin')) {
  // Organisers' page: its own chunk, and none of the attendee map or schedule polling.
  void import('./admin/AdminApp.tsx').then(({ default: AdminApp }) =>
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <ScheduleProvider>
        <App />
      </ScheduleProvider>
    </StrictMode>,
  )
}
