#!/usr/bin/env node
// One-off migration: apply the St. Pete fame+status pass to the dataset.
//   1. load fame results from a workflow output (and cache them to
//      data/fame-stpete.json, committed for provenance) OR from that cache,
//   2. remove permanently-closed + obvious-junk entries, apply renames, de-dupe,
//   3. assign difficulty (easy/medium/hard) by city-relative fame rank (narrow-easy: top 20% / 45% / 35%),
//   4. write public/locations.stpete.json and print a full audit.
//
// This runs ONCE, against the PRE-enrichment dataset; it refuses to run if the
// dataset already carries difficulty (the fame ids would no longer match). To
// re-run, restore the original file from git history first. Future enrichment of
// new/other cities needs a general, idempotent path — see docs/PLAN.md §5.3b.
//
// Usage: node scripts/apply-difficulty-stpete.mjs [fame-workflow-output.json]
//   (omit the arg to re-derive from the committed data/fame-stpete.json cache)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const FAME_OUT = process.argv[2]
const DATASET = new URL('../public/locations.stpete.json', import.meta.url)
const CACHE_DIR = new URL('../data/', import.meta.url)
const CACHE = new URL('../data/fame-stpete.json', import.meta.url)

const EASY_PCT = 0.2 // top 20% by fame -> easy
const HARD_PCT = 0.35 // bottom 35% -> hard ; middle 45% -> medium

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

// SAFETY: one-off migration against the PRE-enrichment dataset. If it already
// carries difficulty, the fame ids no longer match (renames/removals applied)
// and re-running would corrupt it. Refuse rather than mangle.
if (orig.some((l) => l.difficulty != null)) {
  console.error(
    'Refusing to run: public/locations.stpete.json is already enriched (has difficulty).\n' +
      'Restore the pre-enrichment file from git history before re-running.',
  )
  process.exit(1)
}

const audit = {
  closed: [],
  junk: [],
  renamedClosed: [],
  renamed: [],
  deduped: [],
}

// ---- pass 1: cleanup ----
const cleaned = []
for (const loc of orig) {
  const f = fameById.get(loc.id)
  if (!f) {
    // no fame record (shouldn't happen) -> keep, will get median difficulty later
    cleaned.push({ ...loc, _fame: 50 })
    continue
  }
  if (f.status === 'closed') {
    audit.closed.push(`${loc.name} (${loc.id}) — ${f.statusNote ?? ''}`)
    continue
  }
  if (f.status === 'uncertain' && (f.reviewCount ?? 0) < 30) {
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
      ...loc,
      id: newId,
      name: newName,
      clue: null, // old clue may reference the old identity
      _fame: f.fameScore,
    })
    continue
  }
  cleaned.push({ ...loc, _fame: f.fameScore })
}

// ---- pass 2: de-dupe by id (renames can collide, e.g. both 400-beach rows) ----
const byId = new Map()
for (const loc of cleaned) {
  const prev = byId.get(loc.id)
  if (!prev) {
    byId.set(loc.id, loc)
  } else {
    // keep the higher-fame row
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
const easyBound = ranked[easyN - 1]._fame
const hardBound = ranked[n - hardN]._fame

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
console.log('=== CLEANUP AUDIT ===')
console.log(`original: ${orig.length}  ->  kept: ${outLocations.length}`)
console.log(`removed closed: ${audit.closed.length}`)
console.log(`removed junk (uncertain, rev<30): ${audit.junk.length}`)
console.log(`removed renamed-to-closed: ${audit.renamedClosed.length}`)
console.log(`renamed (updated): ${audit.renamed.length}`)
console.log(`de-duped: ${audit.deduped.length}`)
console.log('\n--- JUNK REMOVED (eyeball these) ---')
audit.junk.forEach((s) => console.log('  ' + s))
console.log('\n--- RENAMED (updated to new name) ---')
audit.renamed.forEach((s) => console.log('  ' + s))
console.log('\n--- RENAMED-TO-CLOSED (dropped) ---')
audit.renamedClosed.forEach((s) => console.log('  ' + s))
console.log('\n--- DE-DUPED ---')
audit.deduped.forEach((s) => console.log('  ' + s))

console.log('\n=== DIFFICULTY (narrow-easy: top 20% / 45% / 35%) ===')
console.log(
  `easy=${dist.easy} (fame >= ${easyBound})  medium=${dist.medium}  hard=${dist.hard} (fame <= ${hardBound})`,
)

const picks = [
  'the-dali-museum',
  'sunken-gardens',
  'fort-de-soto-county-park',
  'fourth-street-shrimp-store',
  'ceviche-tapas-bar',
  'brick-mortar',
  '3-daughters-brewing',
  'emerald-bar',
  'bandit-coffee',
]
console.log('\n=== VALIDATION PICKS under narrow-easy ===')
for (const id of picks) {
  const l = byId.get(id)
  console.log(`  ${id}: ${l ? `${l.difficulty} (fame=${l._fame})` : 'REMOVED'}`)
}
