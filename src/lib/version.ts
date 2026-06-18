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
 * @param localHash      - Git hash embedded at build time (import.meta.env.VITE_BUILD_HASH)
 * @param remoteHash     - Hash returned by /version.json on the live CDN
 * @param gameInProgress - Whether a game is actively mid-round (see gameInProgress)
 *
 * Returns:
 *   'noop'   — hashes match; nothing to do
 *   'reload' — new deploy detected and nothing would be interrupted; auto-reload
 *   'banner' — new deploy detected but a game is mid-round; prompt instead
 */
export function versionCheckAction(
  localHash: string,
  remoteHash: string,
  gameInProgress: boolean,
): 'noop' | 'reload' | 'banner' {
  if (localHash === remoteHash) return 'noop'
  return gameInProgress ? 'banner' : 'reload'
}
