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
 * cleanup passes (the Jun 14 – Jul 31 2026 St. Pete/Seattle/Ann Arbor runs live
 * in git history). Sweep them when you pin a new day: the cross-day uniqueness
 * guard compares every entry in this file, and the PRNG that `pin-day` freezes
 * is free to re-pick a venue that an already-expired day used.
 */
export const DAILY_OVERRIDES: Record<string, readonly string[]> = {
  // stpete — pinned 2026-08-02 (pin-day)
  'stpete:2026-08-02': [
    'boyd-hill-nature-preserve',
    'saint-petersburg-ale-house',
    'el-huarache-veloz',
    'black-crow-coffee-shop',
    'salems-fresh-eats',
  ],
}
