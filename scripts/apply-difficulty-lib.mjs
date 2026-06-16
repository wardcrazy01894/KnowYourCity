// Pure, unit-tested core of the fame+status → difficulty enrichment pass.
// `apply-difficulty.mjs` is the thin CLI shell over these (load → call these →
// write + audit). Keeping the logic here makes the bucketing and status-cleanup
// rules testable without touching the filesystem — see `apply-difficulty.test.mjs`.

export const EASY_PCT = 0.2 // top 20% by fame -> easy
export const HARD_PCT = 0.35 // bottom 35% -> hard ; middle 45% -> medium
// Play-cap buckets (count-based, applied to the top-`cap` rows): 40% easy /
// 40% medium / 20% hard. At cap 500 that's 200/200/100. See City.playCap.
export const CAP_EASY_PCT = 0.4
export const CAP_HARD_PCT = 0.2
// Fallback fame for a location with no fame record (shouldn't happen if the pass
// ran on this exact dataset) — median so it lands in the medium bucket.
export const MEDIAN_FAME_FALLBACK = 50

// Canonical dataset field order for the written `locations.<city>.json`. The
// projection drops internal scratch fields (e.g. `_fame`) and omits any field a
// row doesn't have. `polygon` (large-footprint scoring, #97) MUST be listed or
// re-running the pass strips it — keep it last since it's a bulky array.
export const FIELD_ORDER = [
  'id',
  'name',
  'lat',
  'lng',
  'category',
  'difficulty',
  'inPlay',
  'fameScore',
  'clue',
  'photoUrl',
  'source',
  'attribution',
  'polygon',
]

/** Project a (possibly scratch-annotated) location to a clean, ordered row. */
export function projectLocation(loc) {
  const o = {}
  for (const k of FIELD_ORDER) if (k in loc) o[k] = loc[k]
  return o
}

export const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Normalize a venue name for national-chain matching: lowercase, DELETE
 * apostrophes (so "Church's" -> "churchs", not "church s"), turn other
 * punctuation into spaces, collapse runs. Used by matchNationalChain.
 */
export const normalizeForChain = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Return the matched national-chain token if `name` contains one as a
 * word-boundary token sequence, else null. `chains` are tokens from
 * `data/national-chains.json` (normalized here, so they can be written naturally).
 * The list is a FLAGGING aid, not an auto-remover — see scripts/check-chains.mjs
 * and the guard test in apply-difficulty.test.mjs.
 * @param {string} name venue display name
 * @param {string[]} chains chain tokens
 * @returns {string|null}
 */
export function matchNationalChain(name, chains = []) {
  const padded = ` ${normalizeForChain(name)} `
  for (const ch of chains) {
    const c = normalizeForChain(ch)
    if (c && padded.includes(` ${c} `)) return c
  }
  return null
}

/**
 * Build the id -> fame-record lookup. Records are keyed by their primary `id`
 * AND, for `renamed` records, additionally aliased under `slug(currentName)` —
 * the id the row will carry on a *re-run* after the rename has been applied.
 * Without the alias, re-running the pass on an already-enriched dataset orphans
 * every renamed row (its new id isn't in the cache), dropping it to the median
 * fallback. A rename alias never clobbers a real primary id (primaries win).
 * @param {object[]} results fame records (from the workflow output / cache)
 * @returns {Map<string, object>}
 */
export function buildFameIndex(results) {
  const byId = new Map()
  for (const r of results) byId.set(r.id, r) // primary ids first
  for (const r of results) {
    if (r.status === 'renamed' && (r.currentName || '').trim()) {
      const alias = slug(r.currentName)
      if (alias && !byId.has(alias)) byId.set(alias, r) // don't shadow a real id
    }
  }
  return byId
}

/**
 * Pass 1 — status cleanup. Given the original locations and a fameById lookup,
 * drop permanently-closed / national-chain / junk (`status: 'uncertain'') /
 * renamed-to-closed entries, apply still-operating renames (new id + name, clue
 * nulled), and keep the rest. Any prior `difficulty` is stripped so re-runs start
 * clean. Surviving entries carry a numeric `_fame` for ranking.
 * @returns {{ cleaned: object[], audit: object }}
 */
export function cleanLocations(
  orig,
  fameById,
  medianFallback = MEDIAN_FAME_FALLBACK,
) {
  const audit = {
    closed: [],
    junk: [],
    chains: [],
    renamedClosed: [],
    renamed: [],
    noFame: [],
  }
  const cleaned = []
  for (const loc of orig) {
    const { difficulty: _d, ...bare } = loc
    void _d
    const f = fameById.get(loc.id)
    if (!f) {
      audit.noFame.push(`${loc.name} (${loc.id})`)
      cleaned.push({ ...bare, _fame: medianFallback, _reviewCount: 0 })
      continue
    }
    if (f.status === 'closed') {
      audit.closed.push(`${loc.name} (${loc.id}) — ${f.statusNote ?? ''}`)
      continue
    }
    if (f.isNationalChain) {
      audit.chains.push(`${loc.name} (${loc.id}) — national chain`)
      continue
    }
    if (f.status === 'uncertain') {
      audit.junk.push(
        `${loc.name} (${loc.id}) — rev~${f.reviewCount} — ${f.statusNote ?? ''}`,
      )
      continue
    }
    if (f.status === 'renamed') {
      const newName = (f.currentName || '').trim()
      if (!newName || /closed/i.test(newName)) {
        audit.renamedClosed.push(
          `${loc.name} (${loc.id}) -> ${newName || '(unknown)'} — dropped (also closed)`,
        )
        continue
      }
      const newId = slug(newName)
      audit.renamed.push(`${loc.name} (${loc.id}) -> ${newName} (${newId})`)
      cleaned.push({
        ...bare,
        id: newId,
        name: newName,
        clue: null, // old clue may reference the old identity
        _fame: f.fameScore,
        _reviewCount: f.reviewCount ?? 0,
      })
      continue
    }
    cleaned.push({
      ...bare,
      _fame: f.fameScore,
      _reviewCount: f.reviewCount ?? 0,
    })
  }
  return { cleaned, audit }
}

/**
 * Pass 2 — de-dupe by id (renames can collide with an existing entry). Keeps the
 * higher-`_fame` of any colliding pair.
 * @returns {{ kept: object[], deduped: string[] }}
 */
export function dedupeById(cleaned) {
  const byId = new Map()
  const deduped = []
  for (const loc of cleaned) {
    const prev = byId.get(loc.id)
    if (!prev) {
      byId.set(loc.id, loc)
      continue
    }
    const keep = loc._fame >= prev._fame ? loc : prev
    const drop = keep === loc ? prev : loc
    deduped.push(
      `${drop.name} (${drop.id}) — merged into duplicate, kept fame=${keep._fame}`,
    )
    byId.set(loc.id, keep)
  }
  return { kept: [...byId.values()], deduped }
}

/** Great-circle distance between two {lat,lng} points, in metres (haversine). */
const EARTH_RADIUS_M = 6371000
export function haversineMeters(a, b) {
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Normalize a business name for same-business comparison: lowercase, expand `&`
 * to "and", drop accents/punctuation, collapse whitespace, and strip any TRAILING
 * city token (e.g. "Moore Coffee Seattle" -> "moore coffee"). A leading/internal
 * city word (e.g. "Seattle Coffee Works") is part of the real name and kept.
 */
export function normalizeBusinessName(name, cityTokens = []) {
  let b = String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const tk of cityTokens) {
    const t = String(tk).toLowerCase().trim()
    if (t && b.endsWith(' ' + t)) b = b.slice(0, -(t.length + 1)).trim()
  }
  return b
}

export const DEFAULT_DEDUPE_METERS = 150

/**
 * Canonical ranking comparator: by fame (desc), then **review count** (desc) as a
 * meaningful tie-break for the many rows that share a coarse 0–100 `fameScore`
 * (e.g. Seattle has 90+ rows tied at fame 44 straddling the play-cap cut — review
 * count orders them far better than the alphabet), then id (asc) for full
 * determinism. Used for difficulty bucketing, the play cap, and picking the
 * survivor of a same-name de-dupe.
 */
export function byFameRank(a, b) {
  return (
    b._fame - a._fame ||
    (b._reviewCount ?? 0) - (a._reviewCount ?? 0) ||
    (a.id < b.id ? -1 : 1)
  )
}

/**
 * Pass 2.5 — collapse same-business "alternate slug" duplicates that an exact-id
 * de-dupe misses. Rows merge only when they share a normalized name AND are within
 * `maxMeters` of each other; the best-ranked row (see byFameRank) is kept. Merging
 * is **transitive** (union-find): a chain A~B~C within range forms one cluster even
 * if the ends are >maxMeters apart, so the outcome is independent of input order.
 * Rows with the same name but far apart stay separate — they're genuine
 * multi-location businesses (a fish-and-chips with several branches), not dupes.
 * Survivors keep their original input order.
 * @returns {{ kept: object[], merged: string[] }}
 */
export function dedupeByNameProximity(
  kept,
  { cityTokens = [], maxMeters = DEFAULT_DEDUPE_METERS } = {},
) {
  const groups = new Map()
  for (const loc of kept) {
    const key = normalizeBusinessName(loc.name, cityTokens)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(loc)
  }
  const survivors = new Set()
  const merged = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      survivors.add(group[0])
      continue
    }
    // Union-find over the group: connect any two members within maxMeters.
    const parent = group.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (haversineMeters(group[i], group[j]) <= maxMeters) {
          parent[find(i)] = find(j)
        }
      }
    }
    // The best-ranked member of each connected cluster is the survivor; the rest
    // merge into it. Rank by byFameRank so re-runs are deterministic.
    const survivorByRoot = new Map()
    for (const idx of [...group.keys()].sort((x, y) =>
      byFameRank(group[x], group[y]),
    )) {
      const root = find(idx)
      if (!survivorByRoot.has(root)) survivorByRoot.set(root, idx)
    }
    group.forEach((loc, i) => {
      const winner = group[survivorByRoot.get(find(i))]
      if (winner === loc) {
        survivors.add(loc)
      } else {
        merged.push(
          `${loc.name} (${loc.id}) — merged into ${winner.id} (same name, ${Math.round(
            haversineMeters(winner, loc),
          )}m, kept fame=${winner._fame})`,
        )
      }
    })
  }
  return { kept: kept.filter((l) => survivors.has(l)), merged }
}

/**
 * Pass 3 — assign `difficulty` by city-relative fame rank (narrow-easy: top
 * `easyPct` easy / bottom `hardPct` hard / the rest medium). Mutates each kept
 * location's `difficulty` in place (ranked shares object refs with `kept`).
 * @returns {{ ranked: object[], easyN: number, hardN: number, easyBound: number|undefined, hardBound: number|undefined }}
 */
export function assignDifficulty(kept, easyPct = EASY_PCT, hardPct = HARD_PCT) {
  const ranked = [...kept].sort(byFameRank)
  const n = ranked.length
  const easyN = Math.round(n * easyPct)
  const hardN = Math.round(n * hardPct)
  ranked.forEach((loc, i) => {
    loc.difficulty = i < easyN ? 'easy' : i >= n - hardN ? 'hard' : 'medium'
  })
  return {
    ranked,
    easyN,
    hardN,
    easyBound: ranked[easyN - 1]?._fame,
    hardBound: ranked[n - hardN]?._fame,
  }
}

/**
 * Pass 3 (capped variant) — for a city with a `playCap`. Rank by fame, keep the
 * top `cap` as the daily play set (`inPlay: true`) bucketed by COUNT (top
 * `easyPct` easy / last `hardPct` hard / the rest medium), and mark the
 * remainder `inPlay: false` with NO `difficulty` (they stay in the dataset, with
 * their fame, for provenance and a quick re-cap). Mutates each kept location.
 * @returns {{ ranked: object[], playN: number, easyN: number, hardN: number, easyBound: number|undefined, hardBound: number|undefined }}
 */
export function assignCappedDifficulty(
  kept,
  cap,
  easyPct = CAP_EASY_PCT,
  hardPct = CAP_HARD_PCT,
) {
  const ranked = [...kept].sort(byFameRank)
  const playN = Math.min(cap, ranked.length)
  const easyN = Math.round(playN * easyPct)
  const hardN = Math.round(playN * hardPct)
  // medium = playN - easyN - hardN is always >= 1 for playN >= 1 (since
  // round(0.4n)+round(0.2n) < n), so no play set is ever left with zero of a
  // bucket. The CLI also warns if a bucket somehow comes out empty.
  ranked.forEach((loc, i) => {
    if (i < playN) {
      loc.inPlay = true
      loc.difficulty =
        i < easyN ? 'easy' : i >= playN - hardN ? 'hard' : 'medium'
    } else {
      loc.inPlay = false
      delete loc.difficulty
    }
  })
  return {
    ranked,
    playN,
    easyN,
    hardN,
    easyBound: ranked[easyN - 1]?._fame,
    hardBound: ranked[playN - hardN]?._fame,
  }
}
