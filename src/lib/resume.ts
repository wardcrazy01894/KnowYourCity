/**
 * Deciding which game to mount: resume a saved day, or start fresh.
 *
 * A day's lineup is NOT frozen once played — a venue can be removed, an override
 * edited, or the dataset reshuffled after the player has already seen (or even
 * finished) the day. The saved game stores the lineup it was played against, so
 * on reload we compare it to today's freshly-selected lineup and only resume
 * when they match. Otherwise the stored game is stale (it names locations that
 * may no longer exist) and we start fresh so the NEW lineup is actually
 * playable. A genuine replay (the lineup actually changed) is its own
 * completion: it appends a SEPARATE DayRecord — both the original and the replay
 * are kept (see progress.ts:recordCompletion) — while the streak still counts
 * the calendar date only once. Re-finishing the SAME lineup is a no-op.
 */

import type { GameState, Location } from '../types'

/** A fresh, unplayed game for a day's lineup. */
export function freshGame(dateKey: string, locations: Location[]): GameState {
  return { dateKey, locations, roundIndex: 0, results: [], phase: 'guessing' }
}

/** True when two lineups are the same locations in the same order (by id). */
export function sameLineup(a: Location[], b: Location[]): boolean {
  if (a.length !== b.length) return false
  return a.every((loc, i) => loc.id === b[i].id)
}

/**
 * Resume the saved game ONLY when it's for the same day AND its stored lineup
 * matches today's freshly-selected one; otherwise return a fresh game. This is
 * what lets a player replay a day whose locations changed under them instead of
 * being stuck staring at the old (possibly removed) set.
 */
export function resolveInitialGame(
  saved: GameState | undefined,
  dateKey: string,
  locations: Location[],
): GameState {
  if (
    saved &&
    saved.dateKey === dateKey &&
    sameLineup(saved.locations, locations)
  ) {
    return saved
  }
  return freshGame(dateKey, locations)
}
