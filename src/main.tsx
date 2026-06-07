import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installLogging } from './lib/log'
import { applyStartupReset } from './lib/storage'
import 'leaflet/dist/leaflet.css'
import './index.css'

installLogging(import.meta.env.VITE_APP_VERSION ?? '0.1.0')
// Clear saved progress when the URL asks (?reset / ?fresh / ?shuffle / ?random).
// Default loads persist. Must run before React reads stored state. See
// src/lib/devmode.ts.
applyStartupReset()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
