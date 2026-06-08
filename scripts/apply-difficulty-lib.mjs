// Pure, unit-tested core of the fame+status → difficulty enrichment pass.
// `apply-difficulty.mjs` is the thin CLI shell over these (load → call these →
// write + audit). Keeping the logic here makes the bucketing and status-cleanup
// rules testable without touching the filesystem — see `apply-difficulty.test.mjs`.

export const EASY_PCT = 0.2 // top 20% by fame -> easy
export const HARD_PCT = 0.35 // bottom 35% -> hard ; middle 45% -> medium
// Fallback fame for a location with no fame record (shouldn't happen if the pass
// ran on this exact dataset) — median so it lands in the medium bucket.
export const MEDIAN_FAME_FALLBACK = 50

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
      cleaned.push({ ...bare, _fame: medianFallback })
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
      })
      continue
    }
    cleaned.push({ ...bare, _fame: f.fameScore })
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

/**
 * Pass 3 — assign `difficulty` by city-relative fame rank (narrow-easy: top
 * `easyPct` easy / bottom `hardPct` hard / the rest medium). Mutates each kept
 * location's `difficulty` in place (ranked shares object refs with `kept`).
 * @returns {{ ranked: object[], easyN: number, hardN: number, easyBound: number|undefined, hardBound: number|undefined }}
 */
export function assignDifficulty(kept, easyPct = EASY_PCT, hardPct = HARD_PCT) {
  const ranked = [...kept].sort(
    (a, b) => b._fame - a._fame || (a.id < b.id ? -1 : 1),
  )
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
