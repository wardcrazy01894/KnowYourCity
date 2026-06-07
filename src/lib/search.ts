/**
 * Dataset search helpers — used by the "is my place in the game?" lookup.
 * Pure and unit-tested; the React component is a thin shell over these.
 */

import type { Location } from '../types'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Substring search over location names, ranked: prefix matches first, then by
 * how early the match occurs, then alphabetically. Returns [] for <2-char
 * queries. Good enough as an autocomplete source.
 */
export function searchLocations(
  locations: Location[],
  query: string,
  limit = 12,
): Location[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const scored: Array<{ loc: Location; rank: number; idx: number }> = []
  for (const loc of locations) {
    const n = loc.name.toLowerCase()
    const idx = n.indexOf(q)
    if (idx === -1) continue
    scored.push({ loc, rank: n.startsWith(q) ? 0 : 1, idx })
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank || a.idx - b.idx || a.loc.name.localeCompare(b.loc.name),
  )
  return scored.slice(0, limit).map((s) => s.loc)
}

/** True if a place with this (normalized) name is in the dataset. */
export function isIncluded(locations: Location[], query: string): boolean {
  const q = normalize(query)
  if (!q) return false
  return locations.some((l) => normalize(l.name) === q)
}
