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
//
// The status-cleanup / de-dupe / fame-bucketing logic lives in (and is unit-tested
// via) ./apply-difficulty-lib.mjs; this file is the filesystem + audit shell.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import {
  cleanLocations,
  dedupeById,
  assignDifficulty,
  EASY_PCT,
  HARD_PCT,
} from './apply-difficulty-lib.mjs'

const CITY = process.argv[2]
if (!CITY)
  throw new Error(
    'Usage: node scripts/apply-difficulty.mjs <cityId> [fame-output.json]',
  )
const FAME_OUT = process.argv[3]
const DATASET = new URL(`../public/locations.${CITY}.json`, import.meta.url)
const CACHE_DIR = new URL('../data/', import.meta.url)
const CACHE = new URL(`../data/fame-${CITY}.json`, import.meta.url)

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

// ---- pass 1: cleanup · pass 2: de-dupe · pass 3: difficulty (see lib) ----
const { cleaned, audit: cleanAudit } = cleanLocations(orig, fameById)
const { kept, deduped } = dedupeById(cleaned)
const audit = { ...cleanAudit, deduped }
const { easyBound, hardBound } = assignDifficulty(kept, EASY_PCT, HARD_PCT)

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
