/**
 * Pure decision helpers for the stale-tab version check.
 * Extracted so they can be unit-tested independently of React and fetch.
 */

import type { GameState } from '../types'

/**
 * True when there's an unfinished game for TODAY that an auto-reload would
 * interrupt — so we show a dismissible banner instead of reloading under the
 * player. A finished game (the results screen), no saved game, or a stale game
 * from a previous day (which resets to fresh on load anyway) are all safe to
 * reload, so they return false.
 *
 * Note: an un-submitted pin isn't persisted, so a mid-round game is always in
 * the 'guessing'/'revealed' phase here — exactly the case we protect.
 */
export function gameInProgress(
  current: GameState | undefined,
  todayKey: string,
): boolean {
  return Boolean(
    current && current.phase !== 'finished' && current.dateKey === todayKey,
  )
}

/**
 * Decide what to do when /version.json reports a (possibly new) deploy.
 *
 * @param localHash  - Git hash embedded at build time (import.meta.env.VITE_BUILD_HASH)
 * @param remoteHash - Hash returned by /version.json on the live CDN
 * @param midRound   - Whether a game is actively mid-round (see gameInProgress)
 *
 * Returns:
 *   'noop'   — hashes match; nothing to do
 *   'reload' — new deploy detected and nothing would be interrupted; auto-reload
 *   'defer'  — new deploy detected but a game is mid-round; do nothing now. We
 *              never interrupt a guess, so the update is silently picked up by a
 *              later check (interval/tab-focus) once the round/day is over —
 *              there's no banner to click.
 */
export function versionCheckAction(
  localHash: string,
  remoteHash: string,
  midRound: boolean,
): 'noop' | 'reload' | 'defer' {
  if (localHash === remoteHash) return 'noop'
  return midRound ? 'defer' : 'reload'
}
