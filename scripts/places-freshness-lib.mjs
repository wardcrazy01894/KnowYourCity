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

// Token canonicalization so trivial formatting differences don't tank the score.
// Google and OSM disagree constantly on abbreviations ("3rd Ave Cafe" vs "Third
// Avenue Cafe"), spacing ("Boat House" vs "Boathouse"), and appended descriptors
// ("Agelgil" vs "Agelgil Ethiopian Restaurant"). We map both sides to a canonical
// token form before comparing.
const TOKEN_CANON = {
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  rd: 'road',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  pl: 'place',
  sq: 'square',
  hwy: 'highway',
  mt: 'mount',
  ft: 'fort',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
  company: 'co',
  bbq: 'barbecue',
  '1st': 'first',
  '2nd': 'second',
  '3rd': 'third',
  '4th': 'fourth',
  '5th': 'fifth',
  '6th': 'sixth',
  '7th': 'seventh',
  '8th': 'eighth',
  '9th': 'ninth',
  '10th': 'tenth',
}

const canonToken = (t) => TOKEN_CANON[t] || t

/** Canonical no-space form: normalized, abbreviations expanded, spaces removed.
 * "Boat House Deli" and "Boathouse Deli" both collapse to "boathousedeli". */
function concatForm(s) {
  return normalizeName(s).split(' ').filter(Boolean).map(canonToken).join('')
}

/**
 * Name similarity in [0,1], robust to the abbreviation/spacing/descriptor noise
 * between OSM and Google. Order of evidence:
 *  1. identical canonical no-space form -> 1 (handles "3rd Ave"/"Third Avenue",
 *     "AnNamPho"/"An Nam Pho", "Boat House"/"Boathouse").
 *  2. one canonical token set fully contained in the other -> 0.9 (handles
 *     "Agelgil" vs "Agelgil Ethiopian Restaurant Seattle").
 *  3. otherwise token Dice coefficient.
 * Stopwords are dropped (so "The Pink Door" ~ "Pink Door"); if a side is all
 * stopwords we fall back to its raw tokens so we never divide by zero.
 */
export function nameSimilarity(a, b) {
  if (concatForm(a) && concatForm(a) === concatForm(b)) return 1
  const toks = (s) => {
    const all = normalizeName(s).split(' ').filter(Boolean).map(canonToken)
    const kept = all.filter((t) => !STOPWORDS.has(t))
    return new Set(kept.length ? kept : all)
  }
  const sa = toks(a)
  const sb = toks(b)
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const smallSize = Math.min(sa.size, sb.size)
  if (inter === smallSize && smallSize > 0)
    return Math.max(0.9, (2 * inter) / (sa.size + sb.size))
  return (2 * inter) / (sa.size + sb.size)
}

export const DEFAULT_MAX_DISTANCE_M = 400
export const DEFAULT_MIN_NAME_SIM = 0.5
// An operational venue essentially on top of our pin is the same place even if
// the names are formatted differently — two distinct operational businesses
// don't share a sub-75m point. A low name-sim floor still rejects a wholly
// unrelated tenant (a different business that replaced ours).
export const STRONG_PROXIMITY_M = 75
export const STRONG_PROXIMITY_MIN_SIM = 0.2
// Non-business POIs have large footprints, so their Google centroid can sit
// well off our pin; allow more slack before calling a same-name match a miss.
export const NON_BUSINESS_MAX_DISTANCE_M = 600
const NON_BUSINESS_CATEGORIES = new Set([
  'park',
  'landmark',
  'museum',
  'attraction',
  'plaza',
  'golf_course',
])

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
  return decideMatch(
    { nameSim, distanceM, status, category: venue.category },
    { maxDistanceM, minNameSim },
  )
}

/**
 * The pure decision core shared by `classifyVenue` (live candidate) and
 * `classifyFromStored` (a recorded sweep result reclassified offline, no
 * re-fetch). Given the already-computed `nameSim`, `distanceM`, `status`, and
 * `category`, return the verdict/action. Factored out so an improved matcher can
 * be re-applied to a prior run's JSONL without spending API calls again.
 */
export function decideMatch(
  { nameSim, distanceM, status, category },
  {
    maxDistanceM = DEFAULT_MAX_DISTANCE_M,
    minNameSim = DEFAULT_MIN_NAME_SIM,
  } = {},
) {
  const st = status || 'OPERATIONAL'
  // Non-business POIs get a wider distance gate (big footprints, off-centre pins).
  const effMaxDist = NON_BUSINESS_CATEGORIES.has(category)
    ? Math.max(maxDistanceM, NON_BUSINESS_MAX_DISTANCE_M)
    : maxDistanceM
  // No coordinates back from Places means we can't confirm identity by location,
  // so treat it as NOT close — routes to review rather than risking an
  // unverified stamp or (worse) an unverified auto-close.
  const closeEnough = distanceM !== null && distanceM <= effMaxDist
  // Strong-proximity override: a near-coincident operational venue is the same
  // place despite name-formatting noise (only when not closed — we never auto-
  // close on proximity alone, and the floor rejects an unrelated replacement).
  const proximityMatch =
    distanceM !== null &&
    distanceM <= STRONG_PROXIMITY_M &&
    nameSim >= STRONG_PROXIMITY_MIN_SIM &&
    st !== 'CLOSED_PERMANENTLY' &&
    st !== 'CLOSED_TEMPORARILY'
  const matched = proximityMatch || (nameSim >= minNameSim && closeEnough)

  const base = { matched, distanceM, nameSim, businessStatus: st }
  if (st === 'NOT_FOUND')
    return { verdict: 'not_found', action: 'review', ...base }
  if (!matched) return { verdict: 'ambiguous', action: 'review', ...base }
  if (st === 'CLOSED_PERMANENTLY')
    return { verdict: 'closed', action: 'close', ...base }
  if (st === 'CLOSED_TEMPORARILY')
    return { verdict: 'temp_closed', action: 'watch', ...base }
  return { verdict: 'operational', action: 'stamp', ...base }
}

/**
 * Reclassify a recorded sweep result (a JSONL line from places-freshness.mjs)
 * against the current matcher, given the venue's committed row for the name +
 * category. Uses the stored `distanceM`/`businessStatus` (no re-fetch) and
 * recomputes `nameSim` from the stored candidate name.
 */
export function classifyFromStored(record, venue, opts = {}) {
  if (record.candidateName == null && record.businessStatus === 'NOT_FOUND')
    return {
      verdict: 'not_found',
      action: 'review',
      matched: false,
      distanceM: null,
      nameSim: 0,
      businessStatus: 'NOT_FOUND',
    }
  const nameSim = nameSimilarity(venue.name, record.candidateName || '')
  return decideMatch(
    {
      nameSim,
      distanceM: record.distanceM ?? null,
      status: record.businessStatus,
      category: venue.category,
    },
    opts,
  )
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
