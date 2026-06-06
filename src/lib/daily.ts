/**
 * Deterministic daily location selection.
 *
 * GOAL: every player who loads the game on a given UTC calendar day sees the
 * SAME 5 locations in the SAME order, with NO backend. Achieved by hashing the
 * UTC date string into a seed and driving a seeded PRNG.
 *
 * ── Timezone tradeoff (read this) ─────────────────────────────────────────────
 * The "day" is the UTC calendar day, not the player's local day. A player in
 * St. Pete (UTC-4/-5) gets a new puzzle at 7pm/8pm local, not at local midnight.
 * This is intentional: it's the only way two people in different timezones agree
 * on "today's puzzle" without a server. If we later decide everyone should roll
 * over at St. Pete midnight, change getUtcDateKey to apply a fixed -5h offset
 * (America/New_York is DST-variable, so a fixed offset is the simple choice).
 *
 * ── Stability tradeoff (read this) ───────────────────────────────────────────
 * Selection is a pure function of (dateKey, list). The PRNG is seeded ONLY by
 * the date, and we shuffle a COPY of the list ordered by `id` (sorted), so the
 * result is stable across browsers. BUT: if you add/remove/reorder locations in
 * locations.json, the shuffle for every date changes — past and future puzzles
 * shift. For a friends game that's acceptable (nobody re-checks yesterday).
 * If that ever matters, freeze a per-date selection into a committed manifest
 * instead. See docs/PLAN.md §"Daily selection integrity".
 */

import type { Location } from '../types'

export const ROUNDS_PER_DAY = 5

/**
 * Returns the current UTC calendar day as "YYYY-MM-DD".
 * Pure given `now`; defaults to wall clock.
 */
export function getUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * cyrb53 string hash → 32-bit seed. Fast, dependency-free, well-distributed.
 * https://stackoverflow.com/a/52171480
 */
export function hashStringToSeed(str: string): number {
  let h1 = 0xdeadbeef ^ 0
  let h2 = 0x41c6ce57 ^ 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0) ^ (h1 >>> 0)
}

/** mulberry32 — tiny deterministic PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministically pick `count` locations for the given UTC date key.
 *
 * Implementation notes:
 *  - Input list is first sorted by `id` so ordering in the source file does not
 *    affect output (only membership does).
 *  - Fisher–Yates shuffle driven by a date-seeded mulberry32.
 *  - Returns the first `count` of the shuffled array.
 *
 * @throws if the pool has fewer than `count` items.
 */
export function selectDailyLocations(
  all: Location[],
  dateKey: string,
  count: number = ROUNDS_PER_DAY,
): Location[] {
  if (all.length < count) {
    throw new Error(
      `Need at least ${count} locations, got ${all.length}. Add more to locations.json.`,
    )
  }
  const pool = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rand = mulberry32(hashStringToSeed(dateKey))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
