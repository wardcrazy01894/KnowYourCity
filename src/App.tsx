/**
 * App shell: loads the bundled locations, computes today's selection, and
 * renders the Game.
 */

import { useEffect, useState } from 'react'
import type { LocationsFile, Location } from './types'
import { getDateKey, selectDailyLocations } from './lib/daily'
import { log } from './lib/log'
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
      if (r.ok) {
        const file = (await r.json()) as LocationsFile
        log.info('App', `loaded ${file.locations.length} locations`, { url })
        return file
      }
      log.warn('App', `fetch not ok (${r.status})`, { url })
    } catch (e) {
      log.warn('App', 'fetch threw', { url, error: String(e) })
    }
  }
  throw new Error('No locations file found')
}

/**
 * The active date key. Supports `?date=YYYY-MM-DD` to override the day for local
 * testing (so you can play different puzzles without waiting for tomorrow).
 */
function resolveDateKey(): string {
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('date')
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
      log.warn('App', `date override active via ?date=${param}`)
      return param
    }
    if (param) {
      log.warn('App', `ignoring invalid ?date=${param} (expected YYYY-MM-DD)`)
    }
  }
  return getDateKey()
}

export function App() {
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dateKey = resolveDateKey()

  useEffect(() => {
    log.info('App', `resolving puzzle for ${dateKey}`)
    loadLocations()
      .then((file) => {
        const picks = selectDailyLocations(file.locations, dateKey)
        log.info('App', `today's picks`, {
          dateKey,
          picks: picks.map((p) => p.name),
        })
        setToday(picks)
      })
      .catch((e) => {
        log.error('App', 'failed to load puzzle', { error: String(e) })
        setError(String(e))
      })
  }, [dateKey])

  if (error) return <main style={{ padding: 24 }}>Failed to load: {error}</main>
  if (!today) return <main style={{ padding: 24 }}>Loading…</main>

  return (
    <main>
      <header style={{ padding: '12px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Know Your Locals — St. Pete</h1>
        <small style={{ opacity: 0.7 }}>
          Daily puzzle · {dateKey} (ET)
          {import.meta.env.DEV && (
            <span style={{ color: '#f4b400' }}>
              {' '}
              · DEV: resets on refresh (add ?keep to persist)
            </span>
          )}
        </small>
      </header>
      <Game dateKey={dateKey} locations={today} />
    </main>
  )
}
