/**
 * City registry — the single source of truth for which cities exist, their
 * timezone (for the daily rollover), and their map bounds. Mirrors the root
 * `cities.json` that the data-build scripts also read, so app and pipeline never
 * disagree. Each city's dataset lives at `public/locations.<id>.json`.
 */

import citiesData from '../../cities.json'

export interface City {
  id: string
  name: string
  /** Short label for the header/picker, e.g. "St. Pete". */
  short: string
  /** IANA timezone — the puzzle rolls over at midnight here. */
  timeZone: string
  /** Map/play bounds [[south, west], [north, east]]. */
  bounds: [[number, number], [number, number]]
  /** Rough dataset size target (used by the build script). `null` = uncapped. */
  target: number | null
  /**
   * Daily play-set cap: only the top-`playCap` rows by fame are `inPlay` and
   * carry a difficulty (rebucketed top-40% easy / next-40% medium / last-20%
   * hard); the rest stay in the dataset as `inPlay: false`. Omit/`null` to play
   * every enriched row. Applied by scripts/apply-difficulty.mjs.
   */
  playCap?: number | null
}

export const CITIES: City[] = citiesData as unknown as City[]

export const DEFAULT_CITY_ID = 'stpete'

export function getCity(id: string | null | undefined): City | undefined {
  if (!id) return undefined
  return CITIES.find((c) => c.id === id)
}

/**
 * Path to a city's bundled dataset (respects Vite's base).
 *
 * The dataset JSON has a STABLE filename (unlike the content-hashed JS bundle),
 * so a client cache can serve a stale copy against a freshly-loaded bundle —
 * the skew that can desync a bundled daily override from the dataset it names.
 *
 * Defense-in-depth, NOT the only guard: `public/_headers` already sends
 * `Cache-Control: no-cache, must-revalidate` for each `locations.*.json` (added
 * 2026-06-14). Appending `?v=<per-deploy build hash>` adds a layer that the
 * headers don't: a unique URL per deploy can't be collapsed by a cache that
 * ignores `no-cache` (bfcache, an edge/proxy that disregards request headers),
 * and it auto-covers any NEW city without a matching `_headers` entry having to
 * be remembered. The hash is the git short hash injected at build (also emitted
 * in /version.json); falls back to `dev` when no build hash is present.
 */
export function cityDataUrl(id: string): string {
  const v = import.meta.env.VITE_BUILD_HASH ?? 'dev'
  return import.meta.env.BASE_URL + `locations.${id}.json?v=${v}`
}
