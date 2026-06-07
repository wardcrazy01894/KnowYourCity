/**
 * App shell: loads the bundled locations, computes today's selection, and
 * renders the Game.
 */

import { useEffect, useState } from 'react'
import type { LocationsFile, Location } from './types'
import { getUtcDateKey, selectDailyLocations } from './lib/daily'
import { Game } from './components/Game'

// The curated dataset (produced by scripts/fetch-pois.mjs + manual curation).
// Falls back to the small bundled sample if it isn't present yet. Paths respect
// Vite's `base`.
const BASE = import.meta.env.BASE_URL
const DATA_URL = BASE + 'locations.json'
const FALLBACK_URL = BASE + 'locations.sample.json'

async function loadLocations(): Promise<LocationsFile> {
  for (const url of [DATA_URL, FALLBACK_URL]) {
    try {
      const r = await fetch(url)
      if (r.ok) return (await r.json()) as LocationsFile
    } catch {
      // try next
    }
  }
  throw new Error('No locations file found')
}

export function App() {
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dateKey = getUtcDateKey()

  useEffect(() => {
    loadLocations()
      .then((file) => setToday(selectDailyLocations(file.locations, dateKey)))
      .catch((e) => setError(String(e)))
  }, [dateKey])

  if (error) return <main style={{ padding: 24 }}>Failed to load: {error}</main>
  if (!today) return <main style={{ padding: 24 }}>Loading…</main>

  return (
    <main>
      <header style={{ padding: '12px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Know Your Locals — St. Pete</h1>
        <small style={{ opacity: 0.7 }}>Daily puzzle · {dateKey} (UTC)</small>
      </header>
      <Game dateKey={dateKey} locations={today} />
    </main>
  )
}
