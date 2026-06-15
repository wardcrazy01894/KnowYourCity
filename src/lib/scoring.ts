/**
 * Distance + scoring for a single round.
 *
 * Scoring is on a 0–100 scale per round (so a perfect 5-round day = 500):
 *  - polygon locations: a guess INSIDE the polygon → 100; outside → linear
 *    falloff from the nearest polygon edge.
 *  - point locations (no polygon): within POINT_PERFECT_RADIUS_M → 100;
 *    linear falloff from there; 0 at/beyond ZERO_DISTANCE_M.
 *
 * These constants are tunable after playtesting — see docs/PLAN.md §scoring.
 * See docs/plans/POLYGON-SCORING.md for the full polygon-scoring design.
 *
 * [M-B1]
 */

import type { Guess, Location, LocationCategory } from '../types'
import { pointInPolygon, distanceToPolygonMeters, haversineMeters } from './geo'

// geo.ts is the single app-side owner of haversineMeters; re-exported here so
// existing `import { haversineMeters } from './scoring'` callers keep working.
export { haversineMeters }

/** Max points for one round (0–100 scale). A perfect 5-round day = 500. */
export const MAX_ROUND_SCORE = 100

/**
 * For POINT locations (no polygon), the radius within which you get full marks.
 * Tightened from the old 300m: large-footprint locations now use polygon
 * scoring, so point locations no longer need a generous freebie radius. 100m is
 * roughly a city block — close enough to confidently name the place, while
 * still giving a small freebie so a near-perfect pin isn't punished. Tunable
 * after playtesting. See docs/plans/POLYGON-SCORING.md §3.4 for justification.
 *
 * [M-B1]
 */
export const POINT_PERFECT_RADIUS_M = 100

/**
 * Fallback perfect-radius for large-footprint categories (park, golf_course)
 * when the location has NO polygon — e.g. a park that was dropped by the
 * 100-node cap or was unmatched in OSM. Using the legacy 300m here prevents
 * a regression for those locations: without this a player who correctly pins
 * "inside" a large park (but whose polygon was dropped) would now be penalised
 * by the tighter 130m POINT_PERFECT_RADIUS_M.
 *
 * See docs/plans/POLYGON-SCORING.md §Must-fix 1 / §7.7 / §7.3.
 *
 * [M-B1]
 */
export const LARGE_FALLBACK_RADIUS_M = 300

/**
 * @deprecated Use POINT_PERFECT_RADIUS_M for point-location scoring or
 * LARGE_FALLBACK_RADIUS_M for large-footprint fallback. scoreForDistance now
 * accepts a perfectRadiusM parameter so this constant is no longer used as
 * a hardcoded default inside that function. The existing scoring.test.ts
 * tests that call scoreForDistance(300) remain valid because the OLD default
 * was 300 and callers may still pass 300 explicitly.
 */
export const PERFECT_RADIUS_M = 300

/**
 * Returns true when a location category is "large-footprint" — i.e. the
 * guessable area is inherently a large polygon and should get the legacy
 * fallback radius when NO polygon geometry is available.
 *
 * Extend this set if new large-footprint categories are added (venues/stadiums
 * were considered but deferred to v2 — see docs/plans/POLYGON-SCORING.md §2).
 * Exported so the backfill script can use the same predicate to scope its
 * Overpass queries.
 *
 * [M-B1]
 */
const LARGE_FOOTPRINT_CATEGORIES: ReadonlySet<LocationCategory> = new Set([
  'park',
  'golf_course',
])

export function isLargeFootprintCategory(category: LocationCategory): boolean {
  return LARGE_FOOTPRINT_CATEGORIES.has(category)
}

/** At/beyond this distance the round scores 0. */
export const ZERO_DISTANCE_M = 5000

/**
 * Map a distance (meters) to an integer score in [0, MAX_ROUND_SCORE] with a
 * linear falloff between `perfectRadiusM` and ZERO_DISTANCE_M.
 *
 * The `perfectRadiusM` parameter defaults to PERFECT_RADIUS_M (300) so that
 * existing callers (e.g. `scoreForDistance(300)` in scoring.test.ts) remain
 * backward-compatible. `scoreGuess` passes the appropriate radius for each
 * case:
 *  - polygon outside: perfectRadiusM = 0 (falloff starts at the polygon edge)
 *  - point normal:    perfectRadiusM = POINT_PERFECT_RADIUS_M (130)
 *  - point large-footprint no polygon: perfectRadiusM = LARGE_FALLBACK_RADIUS_M (300)
 *
 * @param distanceMeters  - Distance to score (metres).
 * @param perfectRadiusM  - Radius within which the score is MAX_ROUND_SCORE.
 *                          Defaults to PERFECT_RADIUS_M (300) for backwards
 *                          compatibility with direct callers.
 */
export function scoreForDistance(
  distanceMeters: number,
  perfectRadiusM: number = PERFECT_RADIUS_M,
): number {
  if (distanceMeters <= perfectRadiusM) return MAX_ROUND_SCORE
  if (distanceMeters >= ZERO_DISTANCE_M) return 0
  const frac =
    (ZERO_DISTANCE_M - distanceMeters) / (ZERO_DISTANCE_M - perfectRadiusM)
  return Math.round(MAX_ROUND_SCORE * frac)
}

/**
 * Score a guess against a location, returning distance + score.
 *
 * FOUR BRANCHES (implement exactly in this order — see docs/plans/POLYGON-SCORING.md §3.4):
 *
 * 1. **Polygon + inside** (`location.polygon` non-empty AND pointInPolygon):
 *    → `{ distanceMeters: 0, score: MAX_ROUND_SCORE }`.
 *    Perfect score; "0 m" in the UI is honest (you were inside the shape).
 *
 * 2. **Polygon + outside** (`location.polygon` non-empty AND NOT pointInPolygon):
 *    → edgeDist = distanceToPolygonMeters(guess, polygon)
 *    → `{ distanceMeters: edgeDist, score: scoreForDistance(edgeDist, 0) }`
 *    perfectRadiusM = 0: falloff starts AT the polygon edge — even 1 m outside
 *    is <100. No freebie ring outside a polygon.
 *    NOTE: `distanceMeters` here is the distance to the nearest polygon edge,
 *    NOT the distance to the centroid. The JSDoc on RoundResult.distanceMeters
 *    must be updated accordingly (see §9 doc-update checklist).
 *
 * 3. **Point + large-footprint category + NO polygon** (isLargeFootprintCategory
 *    returns true but `location.polygon` is absent/empty):
 *    → centroidDist = haversineMeters(guess, location centroid)
 *    → `{ distanceMeters: centroidDist, score: scoreForDistance(centroidDist, LARGE_FALLBACK_RADIUS_M) }`
 *    Uses 300m fallback to avoid regressing parks whose polygon was dropped by
 *    the 100-node cap or was unmatched in OSM. See docs/plans/POLYGON-SCORING.md §7.3/§7.7.
 *
 * 4. **Point + normal category** (everything else):
 *    → centroidDist = haversineMeters(guess, location centroid)
 *    → `{ distanceMeters: centroidDist, score: scoreForDistance(centroidDist, POINT_PERFECT_RADIUS_M) }`
 *    Uses tightened 130m radius; polygons have removed the need for the old
 *    generous 300m freebie for ordinary point locations.
 *
 * TEST CASES the implementer must ensure pass (see scoring.test.ts [M-B1]):
 *  - point-normal at 130m → score: MAX_ROUND_SCORE; at 131m → score < MAX_ROUND_SCORE
 *  - point-large-no-polygon at 250m → score: MAX_ROUND_SCORE (LARGE_FALLBACK covers it)
 *  - polygon-outside at 1m → score < MAX_ROUND_SCORE (perfectRadius = 0)
 *  - polygon-inside → distanceMeters: 0, score: MAX_ROUND_SCORE
 *
 * [M-B1]
 */
export function scoreGuess(
  location: Location,
  guess: Guess,
): { distanceMeters: number; score: number } {
  const hasPolygon = location.polygon != null && location.polygon.length > 0

  if (hasPolygon) {
    const ring = location.polygon!
    // Branch 1 — inside the polygon: perfect, "0 m".
    if (pointInPolygon([guess.lat, guess.lng], ring)) {
      return { distanceMeters: 0, score: MAX_ROUND_SCORE }
    }
    // Branch 2 — outside: falloff from the nearest edge, no freebie ring.
    const edgeDist = distanceToPolygonMeters([guess.lat, guess.lng], ring)
    return { distanceMeters: edgeDist, score: scoreForDistance(edgeDist, 0) }
  }

  // No polygon: score by distance to the centroid point.
  const distanceMeters = haversineMeters(location, guess)
  // Branch 3 — large-footprint category with no polygon keeps the legacy 300m
  // freebie so a dropped/unmatched park doesn't regress; Branch 4 — ordinary
  // point locations use the tightened radius.
  const perfectRadiusM = isLargeFootprintCategory(location.category)
    ? LARGE_FALLBACK_RADIUS_M
    : POINT_PERFECT_RADIUS_M
  return {
    distanceMeters,
    score: scoreForDistance(distanceMeters, perfectRadiusM),
  }
}

/** Human-friendly distance, e.g. "180 m" or "2.4 km". */
export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`
}
