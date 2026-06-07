/**
 * Deterministic daily location selection.
 *
 * GOAL: every player who loads the game on a given day sees the SAME 5 locations
 * in the SAME order, with NO backend. Achieved by hashing the date string (in
 * the city's timezone) into a seed and driving a seeded PRNG, then filling a
 * fixed per-category round plan (see CATEGORY_PLAN).
 *
 * ── Timezone (read this) ──────────────────────────────────────────────────────
 * The "day" rolls over at midnight in the city's timezone, NOT the player's
 * local timezone and NOT UTC. For St. Pete that's America/New_York (handles
 * EST/EDT automatically). So everyone — wherever they are — gets the same puzzle
 * keyed to St. Pete's calendar day. When we add more cities each will carry its
 * own IANA timezone and call getDateKey(now, city.timeZone).
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

import type { Location, LocationCategory } from '../types'

export const ROUNDS_PER_DAY = 5

/**
 * The fixed shape of a daily game: one of each category, in this order.
 * `landmark` means "anything that isn't a bar/cafe/restaurant"; `wildcard` is
 * any remaining location. If a bucket is empty/exhausted, that slot falls back
 * to any remaining location so we always return a full set.
 */
export type RoundSlot = 'cafe' | 'restaurant' | 'bar' | 'landmark' | 'wildcard'
export const CATEGORY_PLAN: RoundSlot[] = [
  'cafe',
  'restaurant',
  'bar',
  'landmark',
  'wildcard',
]

const FOOD_DRINK: ReadonlySet<LocationCategory> = new Set<LocationCategory>([
  'cafe',
  'restaurant',
  'bar',
])

function matchesSlot(slot: RoundSlot, loc: Location): boolean {
  if (slot === 'wildcard') return true
  if (slot === 'landmark') return !FOOD_DRINK.has(loc.category)
  return loc.category === slot
}

/** Default city timezone (St. Pete). Each future city carries its own. */
export const DEFAULT_TIMEZONE = 'America/New_York'

/**
 * Returns the calendar day in the given IANA timezone as "YYYY-MM-DD".
 * Uses the en-CA locale (which formats as YYYY-MM-DD) so the puzzle rolls over
 * at midnight in that timezone, DST included. Pure given `now`.
 */
export function getDateKey(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
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
 * Deterministically pick `count` locations for the given date key, one per slot
 * in CATEGORY_PLAN (cafe → restaurant → bar → landmark → wildcard).
 *
 * Implementation notes:
 *  - Input list is first sorted by `id` so ordering in the source file does not
 *    affect output (only membership does).
 *  - Fisher–Yates shuffle driven by a date-seeded mulberry32.
 *  - Each plan slot takes the first shuffled location of its category, falling
 *    back to any remaining location when that bucket is empty.
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
  // Deterministic shuffle: sort by id (so source order doesn't matter), then
  // Fisher–Yates with a date-seeded PRNG. Same date + list ⇒ identical result
  // in every browser. No Math.random().
  const pool = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rand = mulberry32(hashStringToSeed(dateKey))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  // Fill each slot from its category, falling back to any remaining location so
  // we always return a full set (e.g. a dataset with no cafés still works).
  const plan = CATEGORY_PLAN.slice(0, count)
  const used = new Set<string>()
  const chosen: Location[] = []
  for (const slot of plan) {
    const pick =
      pool.find((l) => !used.has(l.id) && matchesSlot(slot, l)) ??
      pool.find((l) => !used.has(l.id))
    if (!pick) {
      throw new Error(
        `Could not fill ${count} rounds from ${all.length} locations.`,
      )
    }
    used.add(pick.id)
    chosen.push(pick)
  }
  return chosen
}
