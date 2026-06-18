import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installLogging } from './lib/log'
import { installAnalytics } from './lib/analytics'
import { applyStartupReset } from './lib/storage'
import { resolveMode } from './lib/mode'
import { getCity, storedCityId } from './lib/cities'
import 'leaflet/dist/leaflet.css'
import './index.css'

installLogging(import.meta.env.VITE_APP_VERSION ?? '0.1.0')
// Cloudflare Web Analytics (cookieless page views) — no-op when unset.
installAnalytics(import.meta.env.VITE_CF_BEACON_TOKEN)
// Clear saved progress when the URL asks (?reset / ?fresh / ?shuffle / ?random).
// Default loads persist. Must run before React reads stored state. See
// src/lib/devmode.ts. Scope it to the ACTIVE mode's namespace: ?reset/?fresh
// clear the official daily (replay it fresh), while ?shuffle clears only its
// own `<city>__shuffle` scratch — never the real in-progress daily. (The seed
// only affects the selection, not the storage namespace, so '' is fine here.)
{
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const city = getCity(storedCityId(search))
  applyStartupReset(
    city ? resolveMode(city, search, new Date(), '').storageCityId : null,
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
