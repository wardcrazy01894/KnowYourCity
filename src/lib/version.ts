/**
 * Pure decision function for the stale-tab version check.
 * Extracted so it can be unit-tested independently of React and fetch.
 *
 * @param localHash  - Git hash embedded at build time (import.meta.env.VITE_BUILD_HASH)
 * @param remoteHash - Hash returned by /version.json on the live CDN
 * @param cityChosen - Whether the player has already selected a city
 *
 * Returns:
 *   'noop'   — hashes match; nothing to do
 *   'reload' — new deploy detected and no game is in progress; safe to reload
 *   'banner' — new deploy detected but city is chosen (may be mid-game); show UI prompt
 */
export function versionCheckAction(
  localHash: string,
  remoteHash: string,
  cityChosen: boolean,
): 'noop' | 'reload' | 'banner' {
  if (localHash === remoteHash) return 'noop'
  return cityChosen ? 'banner' : 'reload'
}
