/**
 * Pure decision helpers for the stale-tab version check.
 * Extracted so they can be unit-tested independently of React and fetch.
 */

import type { GameState } from '../types'

/**
 * Whether to DEFER an auto-reload rather than do it now. We only auto-reload when
 * the reload wouldn't change what the player is looking at:
 *   - no saved game (picker / cleared)         → reload OK
 *   - TODAY's finished game (results screen)    → reload OK (re-shows the results)
 * Otherwise we defer:
 *   - a game actively mid-round today           → never interrupt a guess
 *   - ANY game for a day other than `todayKey`  → a reload would resolve to a NEW
 *     day's fresh game; leaving the results screen for the next day is the
 *     player's call (a click), not something we do under them at midnight.
 *
 * `todayKey` must be the REAL current city-local date at check time (not a value
 * captured at last render), so a tab left open past midnight is judged correctly.
 * Note: an un-submitted pin isn't persisted, so a mid-round game is always in the
 * 'guessing'/'revealed' phase here — exactly the case we protect.
 */
export function shouldDeferReload(
  current: GameState | undefined,
  todayKey: string,
): boolean {
  if (!current) return false
  if (current.dateKey !== todayKey) return true
  return current.phase !== 'finished'
}

/**
 * Decide what to do when /version.json reports a (possibly new) deploy.
 *
 * @param localHash  - Git hash embedded at build time (import.meta.env.VITE_BUILD_HASH)
 * @param remoteHash - Hash returned by /version.json on the live CDN
 * @param defer      - Whether a reload would interrupt the player (see shouldDeferReload)
 *
 * Returns:
 *   'noop'   — hashes match; nothing to do
 *   'reload' — new deploy detected and a reload wouldn't disrupt anything; reload
 *   'defer'  — new deploy detected but a reload would disrupt the player (mid-round,
 *              or sitting on results after the day rolled over); do nothing now. A
 *              later check (interval/tab-focus) picks it up once it's safe — there's
 *              no banner to click.
 */
export function versionCheckAction(
  localHash: string,
  remoteHash: string,
  defer: boolean,
): 'noop' | 'reload' | 'defer' {
  if (localHash === remoteHash) return 'noop'
  return defer ? 'defer' : 'reload'
}
