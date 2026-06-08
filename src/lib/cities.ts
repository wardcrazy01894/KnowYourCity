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
}

export const CITIES: City[] = citiesData as unknown as City[]

export const DEFAULT_CITY_ID = 'stpete'

export function getCity(id: string | null | undefined): City | undefined {
  if (!id) return undefined
  return CITIES.find((c) => c.id === id)
}

/** Path to a city's bundled dataset (respects Vite's base). */
export function cityDataUrl(id: string): string {
  return import.meta.env.BASE_URL + `locations.${id}.json`
}
