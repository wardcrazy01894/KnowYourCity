import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installLogging } from './lib/log'
import { applyStartupReset } from './lib/storage'
import 'leaflet/dist/leaflet.css'
import './index.css'

installLogging(import.meta.env.VITE_APP_VERSION ?? '0.1.0')
// Dev: start fresh on every refresh (opt out with ?keep). No-op in production
// unless ?fresh/?reset is present. Must run before React reads stored state.
applyStartupReset()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
