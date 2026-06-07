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
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed?.version !== STORAGE_VERSION) {
      log.warn('storage', 'version mismatch — resetting saved state', {
        found: parsed?.version,
        expected: STORAGE_VERSION,
      })
      return defaultState()
    }
    log.debug('storage', 'loaded state', {
      streak: parsed.streak?.current,
      history: parsed.history?.length,
      hasCurrent: Boolean(parsed.current),
    })
    return parsed
  } catch (e) {
    // Corrupt JSON, disabled storage, etc. — never throw on read.
    log.warn('storage', 'load failed — using defaults', { error: String(e) })
    return defaultState()
  }
}

/** Persists state. Swallow quota/serialization errors (best-effort). */
export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    log.debug('storage', 'saved state')
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

/** Remove all persisted KYL state. Used by the dev fresh-start helper. */
export function clearState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch (e) {
    log.warn('storage', 'clear failed', { error: String(e) })
  }
}

/**
 * Pure decision: should this page load start from a clean slate?
 *  - `?keep`            → never reset (opt out, even in dev)
 *  - `?fresh` / `?reset`→ always reset (handy on the live site too)
 *  - otherwise          → reset only in dev (`isDev`)
 */
export function shouldStartFresh(search: string, isDev: boolean): boolean {
  const params = new URLSearchParams(search)
  if (params.has('keep')) return false
  return params.has('fresh') || params.has('reset') || isDev
}

/**
 * Dev convenience: in `npm run dev`, every load starts FRESH so you can iterate
 * by just hitting refresh. Opt out with `?keep`. In the production build this is
 * OFF unless `?fresh`/`?reset` is present. Returns true if it cleared. Call once
 * at startup, before any component reads state.
 */
export function applyStartupReset(): boolean {
  if (typeof window === 'undefined') return false
  if (!shouldStartFresh(window.location.search, import.meta.env.DEV))
    return false
  clearState()
  log.info('storage', 'startup reset: cleared saved state (dev/fresh mode)')
  return true
}
