// @ts-check
/**
 * chain-grouping.mjs — the SHARED brand-grouping, multi-location test, and
 * name-matching used by detect/normalize/add/assign-flagship. These were copied
 * into three scripts and drifted: assign-flagship-pins was missing the
 * multi-location guard, so it prefix-merged DIFFERENT businesses ("LTD" vs "LTD
 * Edition Sushi") and swapped their pins. Centralising prevents that recurrence.
 */

import {
  normalizeBusinessName,
  haversineMeters,
  matchNationalChain,
} from './apply-difficulty-lib.mjs'

export const FOOD = new Set(['cafe', 'bar', 'restaurant'])

// Irregular siblings prefix-grouping can't catch (the bare name lacks the brand
// word). Keyed by city; each inner array is one brand's ids.
export const GROUP_OVERRIDE = {
  stpete: [['kahwa-coffee', 'kahwa-coffee-north', 'kahwa-south']],
}

// Generic words dropped before name-matching, so a brand's DISTINCTIVE tokens
// must be present in a Google match. If a name is ALL generic ("Pizza House"),
// distinctiveTokens falls back to the full token set rather than [] (which would
// vacuously match every nearby business).
const GENERIC = new Set([
  'the',
  'and',
  'of',
  'co',
  'company',
  'pizza',
  'pizzeria',
  'coffee',
  'cafe',
  'restaurant',
  'bar',
  'grill',
  'doughnuts',
  'donuts',
  'kitchen',
  'deli',
  'bakery',
  'tavern',
  'house',
  'roasters',
  'seafood',
  'pub',
  'taco',
  'tacos',
])

export const tok = (s) => s.split(' ').filter(Boolean)
export const isPrefix = (a, b) =>
  a.length < b.length && a.every((t, i) => t === b[i])
/** Strip a trailing " - X" / " (X)" disambiguator to recover the brand base. */
export const baseOf = (n) =>
  n
    .replace(/\s+-\s.*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()

/** Distinctive (non-generic) tokens of a brand name; full tokens if all generic. */
export function distinctiveTokens(name, cityTokens = []) {
  const all = normalizeBusinessName(name, cityTokens).split(' ').filter(Boolean)
  const distinct = all.filter((t) => !GENERIC.has(t))
  return distinct.length ? distinct : all
}

/** Does a Google display name carry the brand's distinctive tokens? */
export function nameMatches(googleName, brandName, cityTokens = []) {
  const want = distinctiveTokens(brandName, cityTokens)
  if (!want.length) return false
  const pn = normalizeBusinessName(googleName, cityTokens)
  return want.every((t) => pn.includes(t))
}

/**
 * Group food rows into brands: two rows are the same brand if their base names
 * (suffix-stripped, accent/`&`-folded, city-token-stripped) are equal or one is
 * a token-prefix of the other. GROUP_OVERRIDE force-merges irregular siblings.
 * @returns {object[][]} array of member arrays (each a brand)
 */
export function brandGroups(rows, cityTokens, cityId) {
  const norm = rows.map((l) =>
    normalizeBusinessName(baseOf(l.name), cityTokens),
  )
  const parent = rows.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a, b) => (parent[find(a)] = find(b))
  const byFirst = new Map()
  rows.forEach((_, i) => {
    const f = tok(norm[i])[0] ?? ''
    if (!byFirst.has(f)) byFirst.set(f, [])
    byFirst.get(f).push(i)
  })
  for (const idxs of byFirst.values())
    for (let a = 0; a < idxs.length; a++)
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a]
        const j = idxs[b]
        if (
          norm[i] === norm[j] ||
          isPrefix(tok(norm[i]), tok(norm[j])) ||
          isPrefix(tok(norm[j]), tok(norm[i]))
        )
          union(i, j)
      }
  const idToIdx = new Map(rows.map((l, i) => [l.id, i]))
  for (const set of GROUP_OVERRIDE[cityId] ?? [])
    for (let k = 1; k < set.length; k++)
      if (idToIdx.has(set[0]) && idToIdx.has(set[k]))
        union(idToIdx.get(set[0]), idToIdx.get(set[k]))
  const groups = new Map()
  rows.forEach((l, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(l)
  })
  return [...groups.values()]
}

/** Canonical display base for a brand: the fewest-token, then shortest, base. */
export function canonicalBase(members) {
  return members
    .map((m) => baseOf(m.name))
    .sort((a, b) => tok(a).length - tok(b).length || a.length - b.length)[0]
}

/**
 * Is this group a genuine MULTI-LOCATION local chain (vs a prefix collision of
 * different businesses like "LTD" / "LTD Edition Sushi")? True iff OSM has ≥2
 * branches of the canonical name, OR ≥2 members of the SAME category sit >300m
 * apart, OR a GROUP_OVERRIDE asserted it. (A co-located dup or a restaurant+bar
 * prefix clash is NOT multi-location.)
 */
export function isMultiLocation(members, canonNorm, osmCounts, cityId) {
  const osmCount = osmCounts.get(canonNorm)?.count ?? 0
  if (osmCount >= 2) return true
  if (
    (GROUP_OVERRIDE[cityId] ?? []).some((set) =>
      members.some((m) => set.includes(m.id)),
    )
  )
    return true
  for (let a = 0; a < members.length; a++)
    for (let b = a + 1; b < members.length; b++)
      if (
        members[a].category === members[b].category &&
        haversineMeters(members[a], members[b]) > 300
      )
        return true
  return false
}

/** True if the brand is a national chain (token list) — excluded from all of this. */
export function isNationalBrand(canonical, natTokens, fameNatIds, members) {
  return (
    !!matchNationalChain(canonical, natTokens) ||
    members.some((m) => fameNatIds.has(m.id))
  )
}
