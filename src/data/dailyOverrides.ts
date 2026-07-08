/**
 * Hand-curated daily overrides — keyed by selectionSeed ("cityId:YYYY-MM-DD").
 * When a key matches, selectDailyLocations returns these IDs verbatim and in
 * the listed order instead of running the PRNG selection.
 *
 * Order is whatever the curator chooses — it is NOT required to follow the
 * easy/easy/medium/medium/hard ramp. Most entries do (it makes a nicer day),
 * but a block may intentionally deviate (e.g. an all-easy run). Do not assume
 * difficulty from slot position.
 *
 * To add overrides: append entries like
 *   'stpete:2026-06-14': ['the-dali-museum', 'bodega', …5 in-play ids…],
 * and re-deploy. Every entry is guard-tested against the real datasets
 * (src/lib/locations.test.ts) — ids must exist, be inPlay, and be distinct.
 *
 * Expired entries never match once the date passes; they're deleted during
 * cleanup passes (the Jun 14 – Jul 2 2026 St. Pete/Seattle/Ann Arbor runs live
 * in git history).
 */
export const DAILY_OVERRIDES: Record<string, readonly string[]> = {}
