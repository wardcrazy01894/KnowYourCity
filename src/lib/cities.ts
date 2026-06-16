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
 * The `?v=<build hash>` is a cache-buster, not decoration: the dataset JSON has
 * a STABLE filename (unlike the content-hashed JS bundle), so without it a
 * client cache can serve a stale dataset against a freshly-loaded bundle. That
 * skew silently broke a daily override once (a bundled override id no longer
 * existed in the cached JSON → selectDailyLocations fell back to a random day).
 * Stamping the per-deploy build hash makes every new bundle fetch a fresh JSON,
 * so the two always move together. Falls back to `dev` outside a build.
 */
export function cityDataUrl(id: string): string {
  const v = import.meta.env.VITE_BUILD_HASH ?? 'dev'
  return import.meta.env.BASE_URL + `locations.${id}.json?v=${v}`
}
