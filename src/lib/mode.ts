/**
 * Resolve the play mode from the URL query params into a {@link Mode}: the real
 * daily, a `?shuffle` random set, a `?date=` override, or the `?polygons` dev
 * round. Pure (takes `search`, `now`, and a shuffle seed) so it's unit-testable
 * without the DOM — see mode.test.ts.
 *
 * Storage isolation: ONLY the official daily writes the real per-city save
 * (`storageCityId === city.id`). Every non-official mode gets its own namespace
 * so finishing it can't bump the real streak, append to real history, or clobber
 * an in-progress daily. (`?polygons` always did this; `?shuffle`/`?date=` now do
 * too — before, they shared `city.id` and a finished non-official game corrupted
 * the player's real streak/history.)
 */

import { getDateKey, isValidDateKey } from './daily'
import { shouldShuffle, isPolygonTest, polygonTestIds } from './devmode'
import { shouldDeferReload } from './version'
import type { City } from './cities'
import type { GameState } from '../types'

export interface Mode {
  dateKey: string
  selectionSeed: string
  label: string
  /**
   * True ONLY for the real daily challenge (today's date-seeded 5). Shuffle and
   * date overrides are false, so their scores never reach the leaderboard — the
   * board only ranks the official daily set everyone shares. See Results.
   */
  official: boolean
  /**
   * `?polygons` dev round: every polygon location in the city, one game, for
   * eyeballing each shaded boundary. The load effect uses selectPolygonLocations
   * instead of the daily selection; progress is stored under an isolated cityId
   * (see `storageCityId`) so it never touches the real daily save.
   */
  polygonTest: boolean
  /**
   * localStorage namespace for Game. Equals `city.id` ONLY for the official
   * daily; non-official modes use an isolated suffix so they never touch the
   * real save.
   */
  storageCityId: string
  /**
   * In `?polygons` mode, the id subset from `?polygons=id1,id2` (or `null` for
   * every polygon). Ignored unless `polygonTest` is true.
   */
  polygonIds: string[] | null
}

export function resolveMode(
  city: City,
  search: string,
  now: Date,
  shuffleSeed: string,
): Mode {
  const today = getDateKey(now, city.timeZone)
  if (isPolygonTest(search)) {
    return {
      dateKey: today,
      selectionSeed: `${city.id}:polygons`,
      label: 'polygon test — every shaded boundary (dev)',
      official: false,
      polygonTest: true,
      storageCityId: `${city.id}__polygons`,
      polygonIds: polygonTestIds(search),
    }
  }
  if (shouldShuffle(search)) {
    return {
      dateKey: today,
      selectionSeed: `${city.id}:shuffle-${shuffleSeed}`,
      label: 'shuffle — random 5 (refresh for a new set)',
      official: false,
      polygonTest: false,
      storageCityId: `${city.id}__shuffle`,
      polygonIds: null,
    }
  }
  const param = new URLSearchParams(search).get('date')
  if (param && isValidDateKey(param)) {
    return {
      dateKey: param,
      selectionSeed: `${city.id}:${param}`,
      label: `${param} (override)`,
      official: false,
      polygonTest: false,
      storageCityId: `${city.id}__date`,
      polygonIds: null,
    }
  }
  return {
    dateKey: today,
    selectionSeed: `${city.id}:${today}`,
    label: today,
    official: true,
    polygonTest: false,
    storageCityId: city.id,
    polygonIds: null,
  }
}

/**
 * Which mode a MOUNTED session should keep rendering when a re-render
 * recomputes `resolveMode` with a fresh clock (scan M3).
 *
 * The official selectionSeed embeds the city-local date, so the first re-render
 * after midnight would otherwise remount <Game> and yank the player into the
 * new day — losing a mid-round guess, or pulling them off a finished day's
 * results without a click. Day-advance is the player's call (the same rule the
 * auto-reload path follows — shouldDeferReload in version.ts), so:
 *
 *  - freeze on `prev` when the seed changed under a same-city official session
 *    AND adopting `next` would disturb a saved game (mid-round, or any game for
 *    a day other than next's today);
 *  - otherwise pass `next` through (first render, same seed, city change,
 *    non-official modes — their seeds don't roll at midnight anyway).
 *
 * `getSaved` is a thunk so the storage read only happens on an actual rollover.
 * Pure given its inputs.
 */
export function resolveSessionMode(
  prev: Mode | null,
  next: Mode,
  getSaved: () => GameState | undefined,
): Mode {
  if (!prev || !next.official || !prev.official) return next
  if (prev.storageCityId !== next.storageCityId) return next
  if (prev.selectionSeed === next.selectionSeed) return prev
  return shouldDeferReload(getSaved(), next.dateKey) ? prev : next
}
