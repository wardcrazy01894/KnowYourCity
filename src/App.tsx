/**
 * App shell: pick a city (landing screen), then load that city's locations,
 * compute the day's selection, and render the Game.
 *
 * Modes (see src/lib/devmode.ts): normal (today's 5, persists), ?reset (same 5,
 * wipes progress each refresh), ?shuffle (random 5 each refresh),
 * ?date=YYYY-MM-DD (a specific day). The selection seed is namespaced per city.
 */

import { useEffect, useRef, useState } from 'react'
import { versionCheckAction, shouldDeferReload } from './lib/version'
import { loadState } from './lib/storage'
import type { LocationsFile, Location } from './types'
import {
  getDateKey,
  selectDailyLocations,
  selectPolygonLocations,
} from './lib/daily'
import { resolveMode } from './lib/mode'
import { DAILY_OVERRIDES } from './data/dailyOverrides'
import { getCity, cityDataUrl } from './lib/cities'
import { isMuted, setMuted } from './lib/sound'
import { log } from './lib/log'
import { Game } from './components/Game'
import { CityPicker } from './components/CityPicker'
import { DatasetSearch } from './components/DatasetSearch'
import { BugReport } from './components/BugReport'

const CITY_KEY = 'kyc:city'
// Generated once per page load; in ?shuffle mode this seeds a fresh random set.
const SHUFFLE_SEED = Math.random().toString(36).slice(2)

const BUILD_HASH = import.meta.env.VITE_BUILD_HASH ?? 'dev'

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

export function App() {
  const [cityId, setCityId] = useState<string | null>(initialCityId)
  const [today, setToday] = useState<Location[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [searching, setSearching] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportPrefill, setReportPrefill] = useState('')
  const [attribution, setAttribution] = useState('')

  // Inline ref — the version-check effect reads the latest game context without
  // re-subscribing. Updated below once a city is known (null on the picker). We
  // keep the timeZone (not a captured dateKey) so the effect can compute the REAL
  // current date itself — correct even for a tab left open past midnight.
  const gameCtxRef = useRef<{ storageCityId: string; timeZone: string } | null>(
    null,
  )

  // Keep players on the latest deploy automatically — no banner, no click. Poll
  // /version.json (served by CF Pages) on tab focus AND on an interval, comparing
  // the build hash embedded at compile time. When it differs we silently reload,
  // EXCEPT when a reload would disrupt the player (see shouldDeferReload): mid-
  // round, or sitting on the results screen after the day has rolled over (a
  // reload would drop them into the new day's game — that should be their click).
  // In those cases we defer; a later check reloads on its own once it's safe. (No
  // service worker, so a reload is all it takes to pick up new code.)
  useEffect(() => {
    if (import.meta.env.DEV) return
    const POLL_MS = 5 * 60_000
    let reloadScheduled = false
    async function checkVersion() {
      if (reloadScheduled) return
      try {
        const r = await fetch(`/version.json?_=${Date.now()}`)
        if (!r.ok) return
        const data = (await r.json()) as { hash: string }
        const ctx = gameCtxRef.current
        const defer = ctx
          ? shouldDeferReload(
              loadState(ctx.storageCityId).current,
              getDateKey(new Date(), ctx.timeZone),
            )
          : false
        const action = versionCheckAction(BUILD_HASH, data.hash, defer)
        if (action === 'noop') return
        log.info('App', 'new deploy detected', {
          local: BUILD_HASH,
          remote: data.hash,
          action,
        })
        if (action === 'reload') {
          reloadScheduled = true // guard overlapping checks from double-reloading
          window.location.reload()
        }
      } catch {
        // offline, fetch blocked, etc. — ignore
      }
    }
    function onVisible() {
      if (!document.hidden) void checkVersion()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => void checkVersion(), POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])

  const city = getCity(cityId)
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const mode = city ? resolveMode(city, search, new Date(), SHUFFLE_SEED) : null
  // Feed the latest game context to the version-check effect (read via ref).
  gameCtxRef.current =
    city && mode
      ? { storageCityId: mode.storageCityId, timeZone: city.timeZone }
      : null

  useEffect(() => {
    if (!city || !mode) return
    let live = true // ignore a resolved fetch if the city changed meanwhile
    setToday(null)
    setError(null)
    loadLocations(city.id)
      .then((file) => {
        if (!live) return
        setAttribution(file.attribution || '')
        const picks = mode.polygonTest
          ? selectPolygonLocations(file.locations, mode.polygonIds)
          : selectDailyLocations(
              file.locations,
              mode.selectionSeed,
              undefined,
              DAILY_OVERRIDES,
            )
        if (mode.polygonTest && picks.length === 0) {
          throw new Error(`${city.name} has no polygon locations to verify.`)
        }
        log.info('App', 'picks', { picks: picks.map((p) => p.name) })
        setToday(picks)
      })
      .catch((e) => {
        if (!live) return
        log.error('App', 'failed to load puzzle', { error: String(e) })
        setError(String(e))
      })
    return () => {
      live = false
    }
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
        onClose={() => {
          setReporting(false)
          setReportPrefill('')
        }}
        context={{ city: city?.name, date: mode?.dateKey }}
        initialMessage={reportPrefill}
      />
    )
  if (searching)
    return (
      <DatasetSearch
        onClose={() => setSearching(false)}
        initialCityId={cityId}
        onRequestAdd={(prefill) => {
          setReportPrefill(prefill)
          setSearching(false)
          setReporting(true)
        }}
      />
    )
  if (!city || !mode)
    return (
      <CityPicker
        onPick={pickCity}
        onSearch={() => setSearching(true)}
        onReport={() => {
          setReportPrefill('')
          setReporting(true)
        }}
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
            Know Your City — {city.short}
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
                · dev: ?reset · ?shuffle · ?polygons
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
              onClick={() => {
                setReportPrefill('')
                setReporting(true)
              }}
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
        cityId={mode.storageCityId}
        cityShort={city.short}
        dateKey={mode.dateKey}
        bounds={city.bounds}
        locations={today}
        official={mode.official}
      />
      <footer
        style={{
          padding: '10px 16px 20px',
          fontSize: 11,
          opacity: 0.55,
          textAlign: 'center',
        }}
      >
        {attribution ||
          'Locations © OpenStreetMap contributors (ODbL). Imagery © Esri / Maxar.'}{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit' }}
        >
          OSM
        </a>
      </footer>
    </main>
  )
}
