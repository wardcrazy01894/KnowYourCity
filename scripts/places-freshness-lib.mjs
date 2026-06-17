// Pure, unit-tested core of the Google Places freshness/validation sweep.
// `places-freshness.mjs` is the I/O shell (load dataset → call Places API →
// call these to classify each result → write lastVerified stamps + status
// changes + a report). Keeping the matching/classification rules here makes them
// testable without the network — see `places-freshness-lib.test.mjs`.
//
// We use Google ONLY to verify (open/closed + identity) and transiently to spot
// fame drift. Per Google's ToS we do not persist their fields (name, address,
// review count) beyond a transient run; nothing here writes Google content to
// the committed dataset except the boolean outcome (stamp/close) and a date.

import { haversineMeters } from './apply-difficulty-lib.mjs'

export { haversineMeters }

/** Normalize a venue name for fuzzy identity comparison: lowercase, expand `&`,
 * drop accents/punctuation, collapse whitespace. */
export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // delete apostrophes so "Mike's" -> "mikes", not "mike s"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'at',
  'in',
  'on',
  'co',
  'inc',
  'llc',
])

/**
 * Token Dice-coefficient name similarity in [0,1]. Stopwords are dropped so
 * "The Pink Door" vs "Pink Door" scores 1.0. If either side is all-stopwords we
 * fall back to the raw token sets so we never divide by zero.
 */
export function nameSimilarity(a, b) {
  const toks = (s) => {
    const all = normalizeName(s).split(' ').filter(Boolean)
    const kept = all.filter((t) => !STOPWORDS.has(t))
    return new Set(kept.length ? kept : all)
  }
  const sa = toks(a)
  const sb = toks(b)
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return (2 * inter) / (sa.size + sb.size)
}

export const DEFAULT_MAX_DISTANCE_M = 400
export const DEFAULT_MIN_NAME_SIM = 0.5

// Categories we trust a Google `CLOSED_PERMANENTLY` for enough to auto-drop the
// row. Google's business_status is meaningful for businesses but unreliable for
// non-businesses: a park/landmark/memorial POI marked "permanently closed"
// usually means the *listing* was removed, not that the place is gone (e.g. the
// historic Ballard Carnegie Library still stands). So a permanent-closure on any
// other category is routed to manual review, never auto-dropped.
export const AUTO_CLOSE_CATEGORIES = new Set(['restaurant', 'cafe', 'bar'])
export function shouldAutoClose(category) {
  return AUTO_CLOSE_CATEGORIES.has(category)
}

/**
 * Classify one venue against its best Google Places candidate.
 *
 * @param {{name:string, lat:number, lng:number}} venue  our committed row
 * @param {{businessStatus?:string, displayName?:string, lat?:number, lng?:number,
 *          userRatingCount?:number}|null} candidate  best Places match (or null)
 * @returns {{verdict:string, action:'stamp'|'close'|'watch'|'review',
 *            matched:boolean, distanceM:number|null, nameSim:number,
 *            businessStatus:string}}
 *
 * verdict/action:
 *  - operational (stamp): a confidently-matched, OPERATIONAL place → stamp lastVerified
 *  - closed (close): a confidently-matched, CLOSED_PERMANENTLY place → mark closed
 *  - temp_closed (watch): CLOSED_TEMPORARILY → keep, do NOT stamp (watch-list)
 *  - not_found (review): no candidate at all
 *  - ambiguous (review): a candidate exists but name/distance don't confidently
 *    match (could be a rename, a different tenant, or a geocoding miss) — never
 *    auto-close or auto-rename a benched venue on a weak match; a human/agent
 *    looks at these.
 */
export function classifyVenue(
  venue,
  candidate,
  {
    maxDistanceM = DEFAULT_MAX_DISTANCE_M,
    minNameSim = DEFAULT_MIN_NAME_SIM,
  } = {},
) {
  if (!candidate) {
    return {
      verdict: 'not_found',
      action: 'review',
      matched: false,
      distanceM: null,
      nameSim: 0,
      businessStatus: 'NOT_FOUND',
    }
  }
  const status = candidate.businessStatus || 'OPERATIONAL' // Places omits it for some operational places
  const nameSim = nameSimilarity(venue.name, candidate.displayName)
  const distanceM =
    typeof candidate.lat === 'number' && typeof candidate.lng === 'number'
      ? haversineMeters(
          { lat: venue.lat, lng: venue.lng },
          { lat: candidate.lat, lng: candidate.lng },
        )
      : null
  const closeEnough = distanceM === null ? true : distanceM <= maxDistanceM
  const matched = nameSim >= minNameSim && closeEnough

  if (!matched) {
    return {
      verdict: 'ambiguous',
      action: 'review',
      matched,
      distanceM,
      nameSim,
      businessStatus: status,
    }
  }
  if (status === 'CLOSED_PERMANENTLY')
    return {
      verdict: 'closed',
      action: 'close',
      matched,
      distanceM,
      nameSim,
      businessStatus: status,
    }
  if (status === 'CLOSED_TEMPORARILY')
    return {
      verdict: 'temp_closed',
      action: 'watch',
      matched,
      distanceM,
      nameSim,
      businessStatus: status,
    }
  return {
    verdict: 'operational',
    action: 'stamp',
    matched,
    distanceM,
    nameSim,
    businessStatus: status,
  }
}

/**
 * Decide whether a venue's fame likely drifted enough to warrant a per-venue
 * recalibration (reported, never auto-applied — fameScore is a curated rubric,
 * not a formula). Flags only meaningful, cap-relevant movement: a large relative
 * change where the new count is non-trivial. Returns null if no flag.
 * @returns {{old:number,new:number,ratio:number}|null}
 */
export function driftFlag(
  oldReviewCount,
  newReviewCount,
  { minNew = 100, ratio = 2 } = {},
) {
  const o = Number(oldReviewCount)
  const n = Number(newReviewCount)
  if (!Number.isFinite(n) || n < minNew) return null
  const base = Number.isFinite(o) && o > 0 ? o : 1
  const r = n / base
  if (r >= ratio || r <= 1 / ratio)
    return { old: o || 0, new: n, ratio: Math.round(r * 100) / 100 }
  return null
}
