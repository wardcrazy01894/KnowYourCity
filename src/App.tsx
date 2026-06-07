/**
 * App shell: pick a city (landing screen), then load that city's locations,
 * compute the day's selection, and render the Game.
 *
 * Modes (see src/lib/devmode.ts): normal (today's 5, persists), ?reset (same 5,
 * wipes progress each refresh), ?shuffle (random 5 each refresh),
 * ?date=YYYY-MM-DD (a specific day). The selection seed is namespaced per city.
 */

import { useEffect, useState } from 'react'
import type { LocationsFile, Location } from './types'
import { getDateKey, selectDailyLocations } from './lib/daily'
import { getCity, cityDataUrl, type City } from './lib/cities'
import { shouldShuffle } from './lib/devmode'
import { isMuted, setMuted } from './lib/sound'
import { log } from './lib/log'
import { Game } from './components/Game'
import { CityPicker } from './components/CityPicker'
import { DatasetSearch } from './components/DatasetSearch'
import { BugReport } from './components/BugReport'

const CITY_KEY = 'kyl:city'
// Generated once per page load; in ?shuffle mode this seeds a fresh random set.
const SHUFFLE_SEED = Math.random().toString(36).slice(2)

async function loadLocations(cityId: string): Promise<LocationsFile> {
  const url = cityDataUrl(cityId)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load ${url} (HTTP ${r.status})`)
  const file = (await r.json()) as LocationsFile
  log.info('App', `loaded ${file.locations.length} locations`, { cityId })
  return file
}

function initialCityId(): string | null {
  if (typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get('city')
  if (getCity(fromUrl)) return fromUrl
  const saved = localStorage.getItem(CITY_KEY)
  if (getCity(saved)) return saved
  return null
}

interface Mode {
  dateKey: string
  selectionSeed: string
  label: string
}

function resolveMode(city: City): Mode {
  const today = getDateKey(new Date(), city.timeZone)
  const search = typeof window !== 'undefined' ? window.location.search : ''
  if (shouldShuffle(search)) {
    return {
      dateKey: today,
      selectionSeed: `${city.id}:shuffle-${SHUFFLE_SEED}`,
      label: 'shuffle — random 5 (refresh for a new set)',
    }
  }
  const param = new URLSearchParams(search).get('date')
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return {
      dateKey: param,
      selectionSeed: `${city.id}:${param}`,
      label: `${param} (override)`,
    }
  }
  return { dateKey: today, selectionSeed: `${city.id}:${today}`, label: today }
}

export function App() {
  const [cityId, setCityId] = useState<string | null>(initialCityId)
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [searching, setSearching] = useState(false)
  const [reporting, setReporting] = useState(false)

  const city = getCity(cityId)
  const mode = city ? resolveMode(city) : null

  useEffect(() => {
    if (!city || !mode) return
    setToday(null)
    setError(null)
    loadLocations(city.id)
      .then((file) => {
        const picks = selectDailyLocations(file.locations, mode.selectionSeed)
        log.info('App', 'picks', { picks: picks.map((p) => p.name) })
        setToday(picks)
      })
      .catch((e) => {
        log.error('App', 'failed to load puzzle', { error: String(e) })
        setError(String(e))
      })
    // mode.selectionSeed captures city + date/shuffle.
  }, [city, mode?.selectionSeed]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickCity(id: string) {
    try {
      localStorage.setItem(CITY_KEY, id)
      const url = new URL(window.location.href)
      url.searchParams.set('city', id)
      window.history.replaceState({}, '', url)
    } catch {
      /* ignore */
    }
    setCityId(id)
  }

  function changeCity() {
    try {
      localStorage.removeItem(CITY_KEY)
      const url = new URL(window.location.href)
      url.searchParams.delete('city')
      window.history.replaceState({}, '', url)
    } catch {
      /* ignore */
    }
    setCityId(null)
    setToday(null)
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  if (reporting)
    return (
      <BugReport
        onClose={() => setReporting(false)}
        context={{ city: city?.name, date: mode?.dateKey }}
      />
    )
  if (searching)
    return (
      <DatasetSearch
        onClose={() => setSearching(false)}
        initialCityId={cityId}
      />
    )
  if (!city || !mode)
    return (
      <CityPicker
        onPick={pickCity}
        onSearch={() => setSearching(true)}
        onReport={() => setReporting(true)}
      />
    )
  if (error) return <main style={{ padding: 24 }}>Failed to load: {error}</main>
  if (!today) return <main style={{ padding: 24 }}>Loading…</main>

  return (
    <main>
      <header
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>
            Know Your Locals — {city.short}
          </h1>
          <small style={{ opacity: 0.7 }}>
            <button
              onClick={changeCity}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7fb2ff',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              ← change city
            </button>{' '}
            · {mode.label}
            {import.meta.env.DEV && (
              <span style={{ color: '#f4b400' }}>
                {' '}
                · dev: ?reset · ?shuffle
              </span>
            )}
          </small>
          <div style={{ marginTop: 4, fontSize: 12, display: 'flex', gap: 12 }}>
            <button
              onClick={() => setSearching(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7fb2ff',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              🔎 is a place in the game?
            </button>
            <button
              onClick={() => setReporting(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7fb2ff',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              🐛 report a bug
            </button>
          </div>
        </div>
        <button
          onClick={toggleMute}
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg)',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>
      <Game
        cityId={city.id}
        dateKey={mode.dateKey}
        bounds={city.bounds}
        locations={today}
      />
    </main>
  )
}
