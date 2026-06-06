/**
 * App shell: loads the bundled locations, computes today's selection, and
 * renders the Game. This is a STUB wired enough to show the data flow; the
 * heavy lifting lives in Game.tsx / MapGuess.tsx / Results.tsx.
 */

import { useEffect, useState } from 'react'
import type { LocationsFile, Location } from './types'
import { getUtcDateKey, selectDailyLocations } from './lib/daily'
import { Game } from './components/Game'

// During v1 we ship locations.sample.json; the data pipeline will produce the
// full locations.json that replaces it. The path respects Vite's `base`.
const DATA_URL = import.meta.env.BASE_URL + 'locations.sample.json'

export function App() {
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dateKey = getUtcDateKey()

  useEffect(() => {
    fetch(DATA_URL)
      .then((r) => r.json() as Promise<LocationsFile>)
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
