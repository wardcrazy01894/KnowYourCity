/**
 * Dev/testing modes, driven by URL query params (client-side only).
 *
 *   (none)     → normal: today's 5, progress persists across refreshes.
 *   ?reset     → same 5 for the day, but wipe progress on every refresh
 *                (replay the same set repeatedly — handy for debugging one set).
 *   ?fresh     → alias of ?reset.
 *   ?shuffle   → a brand-new RANDOM 5 on every refresh (try different things).
 *   ?random    → alias of ?shuffle.
 *   ?date=YYYY-MM-DD → play a specific day's puzzle (persists, no reset).
 *
 * Both helpers are pure (take the location.search string) so they're testable.
 */

/** True if saved progress should be cleared on this load. */
export function shouldStartFresh(search: string): boolean {
  const p = new URLSearchParams(search)
  return p.has('reset') || p.has('fresh') || p.has('shuffle') || p.has('random')
}

/** True if this load should pick a brand-new random set instead of the daily one. */
export function shouldShuffle(search: string): boolean {
  const p = new URLSearchParams(search)
  return p.has('shuffle') || p.has('random')
}
