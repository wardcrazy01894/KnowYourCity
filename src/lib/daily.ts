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
 * local timezone and NOT UTC. Each city carries its own IANA timezone in
 * cities.json (e.g. St. Pete America/New_York, Seattle America/Los_Angeles —
 * EST/EDT/PST handled automatically), and App passes `city.timeZone` to
 * getDateKey. So everyone — wherever they are — gets the same puzzle keyed to the
 * city's calendar day.
 *
 * ── Stability tradeoff (read this) ───────────────────────────────────────────
 * Selection is a pure function of (dateKey, list). The PRNG is seeded ONLY by
 * the date, and we shuffle a COPY of the list ordered by `id` (sorted), so the
 * result is stable across browsers. BUT: if you add/remove/reorder locations in a
 * city's locations file, the shuffle for every date changes — past and future puzzles
 * shift. For a friends game that's acceptable (nobody re-checks yesterday).
 * If that ever matters, freeze a per-date selection into a committed manifest
 * instead. See docs/PLAN.md §"Daily selection integrity".
 */

import type { Difficulty, Location, LocationCategory } from '../types'

export const ROUNDS_PER_DAY = 5

/**
 * The difficulty shape of a daily game: two easy, two medium, one hard, in this
 * order (gentle warm-up → hardest finisher). Engages only when EVERY location in
 * the city's list carries a `difficulty`; otherwise we fall back to CATEGORY_PLAN.
 * The proportion mirrors the bucket sizing (see docs/PLAN.md) so each difficulty
 * recycles at a similar cadence. Within each slot we still prefer a fresh
 * category (see fillByDifficulty) so days don't turn into five restaurants.
 */
export const DIFFICULTY_PLAN: Difficulty[] = [
  'easy',
  'easy',
  'medium',
  'medium',
  'hard',
]

/**
 * Minimum non-food (parks / landmarks / museums / attractions / …) locations in
 * a daily game, so a day is never all cafés/restaurants/bars. The difficulty
 * plan prefers a non-food pick while under this floor (without breaking the
 * difficulty ramp), then reverts to plain category variety. Best-effort: if a
 * city genuinely lacks this many non-food in the needed buckets it returns what
 * it can. See fillByDifficulty.
 */
export const MIN_NON_FOOD_PER_DAY = 1

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

/** Default city timezone (St. Pete); each city in cities.json carries its own. */
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
 * True if `key` is a REAL calendar date in YYYY-MM-DD form. A format-only
 * regex lets impossible dates through (?date=2026-99-99, 2026-02-30): those
 * later produce an Invalid Date inside the streak math, which throws
 * RangeError on game completion. The UTC round-trip catches both invalid
 * dates and silent rollovers (2026-02-30 → Mar 2).
 */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = new Date(key + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key
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
 *  - `overrides` maps a selectionSeed (e.g. "stpete:2026-06-13") to an ordered
 *    list of location IDs; when a match is found those locations are returned
 *    directly, bypassing the PRNG entirely.
 *
 * @throws if the pool has fewer than `count` items.
 */
export function selectDailyLocations(
  all: Location[],
  dateKey: string,
  count: number = ROUNDS_PER_DAY,
  overrides?: Record<string, readonly string[]>,
): Location[] {
  const overrideIds = overrides?.[dateKey]
  if (overrideIds?.length) {
    const byId = new Map(all.map((l) => [l.id, l]))
    const resolved = overrideIds
      .map((id) => byId.get(id))
      .filter((l): l is Location => l != null && l.inPlay !== false)
    if (resolved.length >= count) {
      // Over-long override (more valid IDs than rounds) is a data bug, but the
      // curated picks still beat a random day: honor the first `count` in order
      // rather than discarding the curation. Shout so the list gets trimmed. In
      // a self-consistent build this never fires (a guard test asserts every
      // committed override is exactly ROUNDS_PER_DAY IDs).
      if (resolved.length > count) {
        console.error(
          `[KYC] Override for "${dateKey}" lists ${resolved.length} in-play locations for a ${count}-round day — using the first ${count}. Trim the override to ${count} IDs.`,
        )
      }
      return resolved.slice(0, count)
    }
    // LOUD on purpose (console.error, not warn): a partial resolve means a
    // hand-curated day silently reverted to a random selection — the
    // hurricane-bar failure mode. Name the seed and which IDs dropped so it's
    // actionable. In a self-consistent build this never fires (a guard test
    // asserts every committed override resolves fully); seeing it at runtime
    // means the bundle and dataset are skewed (e.g. a stale cached dataset).
    const dropped = overrideIds.filter((id) => {
      const l = byId.get(id)
      return l == null || l.inPlay === false
    })
    console.error(
      `[KYC] Override for "${dateKey}" resolved ${resolved.length}/${count} in-play locations — falling back to PRNG. Unresolved IDs: ${dropped.join(', ')}.`,
    )
  }
  // Only rows in the daily play set are eligible. A city with a `playCap` marks
  // the rest `inPlay: false` (and strips their difficulty); absent = in play.
  // Filtering here also means the difficulty-plan predicate below sees only
  // enriched rows, so a capped city still runs the difficulty plan.
  const playable = all.filter((l) => l.inPlay !== false)
  if (playable.length < count) {
    throw new Error(
      `Need at least ${count} in-play locations, got ${playable.length}. Add more to the city's locations file (or raise its playCap).`,
    )
  }
  // Deterministic shuffle: sort by id (so source order doesn't matter), then
  // Fisher–Yates with a date-seeded PRNG. Same date + list ⇒ identical result
  // in every browser. No Math.random().
  const pool = [...playable].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const rand = mulberry32(hashStringToSeed(dateKey))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  // Use the difficulty plan once a city is fully enriched; otherwise the legacy
  // category plan. (Cities are enriched one at a time — see docs/DATA-SOURCING.md.)
  return pool.every((l) => l.difficulty != null)
    ? fillByDifficulty(pool, count)
    : fillByCategory(pool, count)
}

/**
 * Every location carrying a non-empty polygon, sorted by id. Powers the
 * `?polygons` dev verification round (src/lib/devmode.ts): one game containing
 * all of a city's shaded boundaries so each can be eyeballed against the map.
 *
 * Unlike the daily selection this is NOT filtered by `inPlay` — a benched
 * (inPlay:false) park still needs its polygon verified — and there is no count
 * cap: it returns however many polygons exist. Pure given `all`.
 *
 * Pass `ids` (from `?polygons=id1,id2`) to restrict the round to just those
 * locations; `null`/omitted returns every polygon. Ids without a polygon are
 * silently skipped.
 */
export function selectPolygonLocations(
  all: Location[],
  ids: string[] | null = null,
): Location[] {
  const allow = ids ? new Set(ids) : null
  return all
    .filter((l) => Array.isArray(l.polygon) && l.polygon.length > 0)
    .filter((l) => !allow || allow.has(l.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Fill each slot from its category (cafe → restaurant → bar → landmark →
 * wildcard), falling back to any remaining location so we always return a full
 * set (e.g. a dataset with no cafés still works).
 */
function fillByCategory(pool: Location[], count: number): Location[] {
  const plan = CATEGORY_PLAN.slice(0, count)
  const used = new Set<string>()
  const chosen: Location[] = []
  for (const slot of plan) {
    const pick =
      pool.find((l) => !used.has(l.id) && matchesSlot(slot, l)) ??
      pool.find((l) => !used.has(l.id))
    if (!pick) {
      throw new Error(`Could not fill ${count} rounds from ${pool.length}.`)
    }
    used.add(pick.id)
    chosen.push(pick)
  }
  return chosen
}

/**
 * Fill each slot from DIFFICULTY_PLAN (easy, easy, medium, medium, hard). Within
 * a slot we "layer both" constraints: prefer a location of the slot's difficulty
 * whose category hasn't appeared yet today, so the day stays varied.
 *
 * Non-food floor: while the day is still short of MIN_NON_FOOD_PER_DAY non-food
 * picks, a non-food location of the slot's difficulty is preferred (front-loaded
 * so parks/landmarks aren't crowded out by food — see the user requirement in
 * docs/PLAN.md). This never overrides the difficulty ramp: we only ever pick a
 * non-food of the *current* slot's difficulty. Once the floor is met we revert
 * to plain category variety. If a difficulty bucket runs short, fall back to any
 * remaining location (still preferring a fresh category) so we always return a
 * full set.
 */
function fillByDifficulty(pool: Location[], count: number): Location[] {
  const plan = DIFFICULTY_PLAN.slice(0, count)
  const used = new Set<string>()
  const usedCategories = new Set<LocationCategory>()
  const chosen: Location[] = []
  let nonFoodPicked = 0
  const isNonFood = (l: Location) => !FOOD_DRINK.has(l.category)
  // Prefer a fresh category within a candidate tier, else its first member.
  const fromTier = (tier: Location[]) =>
    tier.find((l) => !usedCategories.has(l.category)) ?? tier[0]

  for (const difficulty of plan) {
    const ofDifficulty = pool.filter(
      (l) => !used.has(l.id) && l.difficulty === difficulty,
    )
    const wantNonFood = nonFoodPicked < MIN_NON_FOOD_PER_DAY
    const nonFoodOfDifficulty = ofDifficulty.filter(isNonFood)
    // Candidate tiers in priority order. When still under the non-food floor and
    // this difficulty has a non-food option, try those first — without ever
    // leaving the slot's difficulty (the ramp is the hard constraint).
    // While under the non-food floor, non-food wins over a fresh food category
    // (the floor is the stronger guarantee here — see MIN_NON_FOOD_PER_DAY).
    // Each tier still prefers a fresh category internally. At the default floor
    // of 1 the only forced pick is the FIRST non-food, so a "repeated non-food
    // category" can't arise (that would require an earlier non-food pick, which
    // already satisfies the floor and flips wantNonFood off).
    const tiers =
      wantNonFood && nonFoodOfDifficulty.length
        ? [nonFoodOfDifficulty, ofDifficulty]
        : [ofDifficulty]
    const pick =
      tiers.map(fromTier).find(Boolean) ??
      // Difficulty bucket exhausted: fall back to any remaining location.
      pool.find((l) => !used.has(l.id) && !usedCategories.has(l.category)) ??
      pool.find((l) => !used.has(l.id))
    if (!pick) {
      throw new Error(`Could not fill ${count} rounds from ${pool.length}.`)
    }
    used.add(pick.id)
    usedCategories.add(pick.category)
    if (isNonFood(pick)) nonFoodPicked++
    chosen.push(pick)
  }
  return chosen
}
