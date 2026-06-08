#!/usr/bin/env node
// Generalized fame+status → difficulty pass for ANY city. The generalized
// successor to an earlier St. Pete-only one-off pass (since removed); fold new
// cities through this one.
//
//   1. Load fame results from a workflow output (cached to data/fame-<city>.json,
//      committed for provenance) OR from that cache.
//   2. Clean up: remove permanently-closed, obvious junk (status 'uncertain'),
//      national chains, and renamed-to-closed; apply still-operating renames;
//      de-dupe by id (keep higher fame).
//   3. Assign difficulty by city-relative fame rank (narrow-easy: top 20% easy /
//      next 45% medium / bottom 35% hard).
//   4. Write public/locations.<city>.json and print a full audit.
//
// Unlike the St. Pete one-off, this is re-runnable: it re-derives difficulty from
// the cached fameScore each time, so re-run it whenever a city's dataset changes
// (buckets are city-relative). It matches fame records to locations by id, so run
// the fame pass against the SAME dataset you're enriching.
//
// Usage: node scripts/apply-difficulty.mjs <cityId> [fame-workflow-output.json]
//   (omit the file arg to re-derive from the committed data/fame-<city>.json cache)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const CITY = process.argv[2]
if (!CITY)
  throw new Error(
    'Usage: node scripts/apply-difficulty.mjs <cityId> [fame-output.json]',
  )
const FAME_OUT = process.argv[3]
const DATASET = new URL(`../public/locations.${CITY}.json`, import.meta.url)
const CACHE_DIR = new URL('../data/', import.meta.url)
const CACHE = new URL(`../data/fame-${CITY}.json`, import.meta.url)

const EASY_PCT = 0.2 // top 20% by fame -> easy
const HARD_PCT = 0.35 // bottom 35% -> hard ; middle 45% -> medium
// Fallback fame for a location with no fame record (shouldn't happen if the pass
// ran on this exact dataset) — median so it lands in the medium bucket.
const MEDIAN_FAME_FALLBACK = 50

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

// ---- load fame results: from a workflow output (and cache it), or the cache ----
let results
if (FAME_OUT) {
  const raw = JSON.parse(readFileSync(FAME_OUT, 'utf8'))
  results = (raw.result ?? raw).results
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(
    CACHE,
    JSON.stringify(
      results.map((r) => ({
        id: r.id,
        status: r.status,
        currentName: r.currentName || '',
        fameScore: r.fameScore,
        reviewCount: r.reviewCount,
        hasWikipedia: r.hasWikipedia,
        isNationalChain: r.isNationalChain ?? false,
        statusNote: r.statusNote || '',
      })),
      null,
      2,
    ) + '\n',
  )
} else {
  results = JSON.parse(readFileSync(CACHE, 'utf8'))
}
const fameById = new Map(results.map((r) => [r.id, r]))

// ---- load dataset ----
const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const orig = ds.locations

const audit = {
  closed: [],
  junk: [],
  chains: [],
  renamedClosed: [],
  renamed: [],
  deduped: [],
  noFame: [],
}

// ---- pass 1: cleanup ----
const cleaned = []
for (const loc of orig) {
  // strip any prior difficulty so re-runs start clean
  const { difficulty: _d, ...bare } = loc
  void _d
  const f = fameById.get(loc.id)
  if (!f) {
    // no fame record -> keep with median difficulty (shouldn't happen if the
    // fame pass ran on this dataset)
    audit.noFame.push(`${loc.name} (${loc.id})`)
    cleaned.push({ ...bare, _fame: MEDIAN_FAME_FALLBACK })
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

// ---- pass 2: de-dupe by id (renames can collide) ----
const byId = new Map()
for (const loc of cleaned) {
  const prev = byId.get(loc.id)
  if (!prev) {
    byId.set(loc.id, loc)
  } else {
    const keep = loc._fame >= prev._fame ? loc : prev
    const drop = keep === loc ? prev : loc
    audit.deduped.push(
      `${drop.name} (${drop.id}) — merged into duplicate, kept fame=${keep._fame}`,
    )
    byId.set(loc.id, keep)
  }
}
const kept = [...byId.values()]

// ---- pass 3: assign difficulty by fame rank (narrow-easy) ----
const ranked = [...kept].sort(
  (a, b) => b._fame - a._fame || (a.id < b.id ? -1 : 1),
)
const n = ranked.length
const easyN = Math.round(n * EASY_PCT)
const hardN = Math.round(n * HARD_PCT)
ranked.forEach((loc, i) => {
  loc.difficulty = i < easyN ? 'easy' : i >= n - hardN ? 'hard' : 'medium'
})
const easyBound = ranked[easyN - 1]?._fame
const hardBound = ranked[n - hardN]?._fame

// ---- write dataset (preserve field order, drop _fame) ----
const FIELD_ORDER = [
  'id',
  'name',
  'lat',
  'lng',
  'category',
  'difficulty',
  'clue',
  'photoUrl',
  'source',
  'attribution',
]
const outLocations = kept
  .slice()
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((loc) => {
    const o = {}
    for (const k of FIELD_ORDER) if (k in loc) o[k] = loc[k]
    return o
  })
ds.locations = outLocations
writeFileSync(DATASET, JSON.stringify(ds, null, 2) + '\n')

// ---- audit ----
const dist = { easy: 0, medium: 0, hard: 0 }
for (const l of outLocations) dist[l.difficulty]++
console.log(`=== ${CITY} CLEANUP AUDIT ===`)
console.log(`original: ${orig.length}  ->  kept: ${outLocations.length}`)
console.log(`removed closed: ${audit.closed.length}`)
console.log(`removed junk (status uncertain): ${audit.junk.length}`)
console.log(`removed national chains: ${audit.chains.length}`)
console.log(`removed renamed-to-closed: ${audit.renamedClosed.length}`)
console.log(`renamed (updated): ${audit.renamed.length}`)
console.log(`de-duped: ${audit.deduped.length}`)
if (audit.noFame.length)
  console.log(`NO FAME RECORD (kept, median): ${audit.noFame.length}`)
const show = (title, arr) => {
  console.log(`\n--- ${title} ---`)
  arr.forEach((s) => console.log('  ' + s))
}
show('JUNK REMOVED (eyeball these)', audit.junk)
show('CHAINS REMOVED', audit.chains)
show('RENAMED (updated)', audit.renamed)
show('RENAMED-TO-CLOSED (dropped)', audit.renamedClosed)
show('CLOSED REMOVED', audit.closed)
show('DE-DUPED', audit.deduped)
if (audit.noFame.length) show('NO FAME RECORD', audit.noFame)

console.log('\n=== DIFFICULTY (narrow-easy: top 20% / 45% / 35%) ===')
console.log(
  `easy=${dist.easy} (fame >= ${easyBound})  medium=${dist.medium}  hard=${dist.hard} (fame <= ${hardBound})`,
)
