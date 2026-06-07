/**
 * App shell: loads the bundled locations, computes the selection, and renders
 * the Game.
 *
 * Modes (see src/lib/devmode.ts): normal (today's 5, persists), ?reset (same 5,
 * wipes progress each refresh), ?shuffle (random 5 each refresh),
 * ?date=YYYY-MM-DD (a specific day).
 */

import { useEffect, useState } from 'react'
import type { LocationsFile, Location } from './types'
import { getDateKey, selectDailyLocations } from './lib/daily'
import { shouldShuffle } from './lib/devmode'
import { log } from './lib/log'
import { Game } from './components/Game'

const BASE = import.meta.env.BASE_URL
const DATA_URL = BASE + 'locations.json'
const FALLBACK_URL = BASE + 'locations.sample.json'

// Generated once per page load; in ?shuffle mode this seeds a fresh random set.
const SHUFFLE_SEED = Math.random().toString(36).slice(2)

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

interface Mode {
  /** Real calendar date (today or ?date) — used for persistence/streak. */
  dateKey: string
  /** Seed for picking the set — random in shuffle mode, else the date. */
  selectionSeed: string
  /** Friendly header label. */
  label: string
}

function resolveMode(): Mode {
  const today = getDateKey()
  if (typeof window !== 'undefined') {
    const search = window.location.search
    if (shouldShuffle(search)) {
      log.warn('App', 'shuffle mode: random 5 each refresh')
      return {
        dateKey: today,
        selectionSeed: 'shuffle-' + SHUFFLE_SEED,
        label: 'shuffle — random 5 (refresh for a new set)',
      }
    }
    const param = new URLSearchParams(search).get('date')
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
      log.warn('App', `date override via ?date=${param}`)
      return {
        dateKey: param,
        selectionSeed: param,
        label: `${param} (ET, override)`,
      }
    }
    if (param) log.warn('App', `ignoring invalid ?date=${param}`)
  }
  return { dateKey: today, selectionSeed: today, label: `${today} (ET)` }
}

export function App() {
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { dateKey, selectionSeed, label } = resolveMode()

  useEffect(() => {
    log.info('App', `resolving puzzle`, { dateKey, selectionSeed })
    loadLocations()
      .then((file) => {
        const picks = selectDailyLocations(file.locations, selectionSeed)
        log.info('App', `picks`, { picks: picks.map((p) => p.name) })
        setToday(picks)
      })
      .catch((e) => {
        log.error('App', 'failed to load puzzle', { error: String(e) })
        setError(String(e))
      })
  }, [dateKey, selectionSeed])

  if (error) return <main style={{ padding: 24 }}>Failed to load: {error}</main>
  if (!today) return <main style={{ padding: 24 }}>Loading…</main>

  return (
    <main>
      <header style={{ padding: '12px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Know Your Locals — St. Pete</h1>
        <small style={{ opacity: 0.7 }}>
          Daily puzzle · {label}
          {import.meta.env.DEV && (
            <span style={{ color: '#f4b400' }}>
              {' '}
              · dev: ?reset restart · ?shuffle random
            </span>
          )}
        </small>
      </header>
      <Game dateKey={dateKey} locations={today} />
    </main>
  )
}
