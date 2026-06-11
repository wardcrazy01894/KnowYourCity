/**
 * localStorage persistence for streaks, history, and resume-in-progress.
 *
 * VERSIONING: bump STORAGE_VERSION whenever the persisted shape changes.
 * `loadState` MUST tolerate older/missing/corrupt data by returning a fresh
 * default rather than throwing — otherwise a schema change bricks returning
 * players. Treat any parse error or version mismatch as "no saved data".
 */

import type { DayRecord, GameState } from '../types'
import { log } from './log'
import { shouldStartFresh } from './devmode'

export const STORAGE_VERSION = 1
const PREFIX = 'kyc:v' + STORAGE_VERSION
/** Streak/history/resume are per-city, so the key is namespaced by city id. */
const keyFor = (cityId: string) => `${PREFIX}:${cityId}`

export interface PersistedState {
  version: number
  /** In-progress game, if the player hasn't finished today. */
  current?: GameState
  /** Completed days, newest last. */
  history: DayRecord[]
  streak: { current: number; best: number; lastPlayedDateKey: string | null }
}

/** Returns persisted state for a city, or a fresh default on miss/corruption. */
export function loadState(cityId: string): PersistedState {
  try {
    const raw = localStorage.getItem(keyFor(cityId))
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed?.version !== STORAGE_VERSION) {
      log.warn('storage', 'version mismatch — resetting saved state', {
        found: parsed?.version,
        expected: STORAGE_VERSION,
      })
      return defaultState()
    }
    return parsed
  } catch (e) {
    // Corrupt JSON, disabled storage, etc. — never throw on read.
    log.warn('storage', 'load failed — using defaults', { error: String(e) })
    return defaultState()
  }
}

/** Persists a city's state. Swallow quota/serialization errors (best-effort). */
export function saveState(cityId: string, state: PersistedState): void {
  try {
    localStorage.setItem(keyFor(cityId), JSON.stringify(state))
  } catch (e) {
    // Quota exceeded / private mode — best-effort, ignore.
    log.warn('storage', 'save failed (quota/private mode?)', {
      error: String(e),
    })
  }
}

export function defaultState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    history: [],
    streak: { current: 0, best: 0, lastPlayedDateKey: null },
  }
}

/** Remove all persisted per-city game state (used by the dev fresh-start helper). */
export function clearState(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX + ':')) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch (e) {
    log.warn('storage', 'clear failed', { error: String(e) })
  }
}

/**
 * Clears saved progress on load when the URL asks for it (`?reset`/`?fresh`/
 * `?shuffle`) — see src/lib/devmode.ts. Default loads persist. Returns true if
 * it cleared. Call once at startup, before any component reads state.
 */
export function applyStartupReset(): boolean {
  if (typeof window === 'undefined') return false
  if (!shouldStartFresh(window.location.search)) return false
  clearState()
  log.info('storage', 'startup reset: cleared saved state')
  return true
}
