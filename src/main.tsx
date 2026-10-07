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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScheduleProvider>
      <App />
    </ScheduleProvider>
  </StrictMode>,
)
