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
 *   ?polygons  → DEV verification round: every polygon location in the current
 *                city, in one game, so each shaded boundary can be eyeballed.
 *                Never official (off the leaderboard); see resolveMode in mode.ts.
 *   ?polygons=id1,id2 → same round restricted to those location ids (re-check
 *                a few specific boundaries without playing all of them).
 *   ?celebrate → force the strong-finish celebration (confetti + cheer) on the
 *                results screen regardless of score, to preview/tune it.
 *
 * All helpers are pure (take the location.search string) so they're testable.
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

/**
 * True for the `?celebrate` dev flag — forces the results-screen celebration
 * (confetti + cheer) regardless of score, so it can be previewed and tuned
 * without having to actually play a strong game.
 */
export function isCelebrateTest(search: string): boolean {
  return new URLSearchParams(search).has('celebrate')
}

/**
 * True for the `?polygons` dev round: a single game seeded with every polygon
 * location in the current city (sorted by id), for visually verifying each
 * shaded boundary. Off the leaderboard and stored under an isolated key.
 */
export function isPolygonTest(search: string): boolean {
  return new URLSearchParams(search).has('polygons')
}

/**
 * The id subset for `?polygons=id1,id2` — restricts the verification round to
 * just those locations (handy for re-checking a few specific boundaries).
 * Returns `null` for the bare `?polygons` (every polygon) or when it isn't a
 * polygon test at all; callers gate on {@link isPolygonTest} first.
 */
export function polygonTestIds(search: string): string[] | null {
  const raw = new URLSearchParams(search).get('polygons')
  if (!raw) return null
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length > 0 ? ids : null
}
