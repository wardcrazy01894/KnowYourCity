/**
 * localStorage persistence for streaks, history, and resume-in-progress.
 *
 * VERSIONING: bump STORAGE_VERSION whenever the persisted shape changes.
 * `loadState` MUST tolerate older/missing/corrupt data by returning a fresh
 * default rather than throwing — otherwise a schema change bricks returning
 * players. Treat any parse error or version mismatch as "no saved data".
 */

import type { DayRecord, GameState } from '../types'

export const STORAGE_VERSION = 1
const KEY = 'kyl:v' + STORAGE_VERSION

export interface PersistedState {
  version: number
  /** In-progress game, if the player hasn't finished today. */
  current?: GameState
  /** Completed days, newest last. */
  history: DayRecord[]
  streak: { current: number; best: number; lastPlayedDateKey: string | null }
}

/** Returns persisted state, or a fresh default on miss/corruption/version skew. */
export function loadState(): PersistedState {
  // TODO: read KEY from localStorage, JSON.parse in try/catch, validate
  // `version === STORAGE_VERSION`, else return defaultState().
  throw new Error('not implemented')
}

/** Persists state. Swallow quota/serialization errors (best-effort). */
export function saveState(_state: PersistedState): void {
  // TODO
  throw new Error('not implemented')
}

export function defaultState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    history: [],
    streak: { current: 0, best: 0, lastPlayedDateKey: null },
  }
}
