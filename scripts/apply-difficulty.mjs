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
//   3. Assign difficulty by city-relative fame rank. With a `playCap` (every
//      enriched city today) the top-playCap rows go in-play, count-bucketed
//      40% easy / 40% medium / 20% hard; an uncapped city instead uses the
//      narrow-easy percentile split (top 20% easy / 45% medium / 35% hard).
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
  buildFameIndex,
  cleanLocations,
  dedupeById,
  dedupeByNameProximity,
  assignDifficulty,
  assignCappedDifficulty,
  projectLocation,
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
const fameById = buildFameIndex(results)

// ---- load dataset ----
const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const orig = ds.locations

// ---- city playCap (top-N-by-fame play set), from cities.json ----
const CITIES = JSON.parse(
  readFileSync(new URL('../cities.json', import.meta.url), 'utf8'),
)
const cityRow = CITIES.find((c) => c.id === CITY)
const playCap = cityRow?.playCap ?? null
// Trailing city tokens to strip before same-business name comparison (e.g.
// "Moore Coffee Seattle" -> "moore coffee"), from the city's short + name.
const cityTokens = [
  ...new Set(
    [cityRow?.short, (cityRow?.name || '').split(',')[0]]
      .filter(Boolean)
      .map((s) =>
        s
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
  ),
]

// ---- pass 1: cleanup · 2: de-dupe by id · 2.5: de-dupe by name+proximity ·
//      pass 3: difficulty (see lib) ----
const { cleaned, audit: cleanAudit } = cleanLocations(orig, fameById)
const { kept: keptById, deduped } = dedupeById(cleaned)
const { kept, merged: nameMerged } = dedupeByNameProximity(keptById, {
  cityTokens,
})
const audit = { ...cleanAudit, deduped, nameMerged }
// Carry fame onto each kept row (so the cap can be re-derived without re-running
// the research). Then bucket: capped cities use the count-based play-set cap;
// uncapped cities use the percentile split (and play every enriched row).
for (const loc of kept) loc.fameScore = loc._fame
const capInfo = playCap
  ? assignCappedDifficulty(kept, playCap)
  : assignDifficulty(kept, EASY_PCT, HARD_PCT)
const { easyBound, hardBound } = capInfo

// ---- write dataset (canonical field order, drop _fame; see lib FIELD_ORDER) ----
const outLocations = kept
  .slice()
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map(projectLocation)
ds.locations = outLocations
writeFileSync(DATASET, JSON.stringify(ds, null, 2) + '\n')

// ---- audit ----
const dist = { easy: 0, medium: 0, hard: 0 }
for (const l of outLocations) if (l.difficulty) dist[l.difficulty]++
const inPlayCount = outLocations.filter((l) => l.inPlay !== false).length
// A fillable daily plan needs at least 2 easy / 2 medium / 1 hard; warn loudly
// if bucketing left any tier short (only possible with an extreme tiny cap).
for (const [tier, min] of [
  ['easy', 2],
  ['medium', 2],
  ['hard', 1],
]) {
  if (dist[tier] < min)
    console.warn(`⚠️  WARNING: only ${dist[tier]} ${tier} (plan needs ${min}).`)
}
console.log(`=== ${CITY} CLEANUP AUDIT ===`)
console.log(`original: ${orig.length}  ->  kept: ${outLocations.length}`)
console.log(`removed closed: ${audit.closed.length}`)
console.log(`removed junk (status uncertain): ${audit.junk.length}`)
console.log(`removed national chains: ${audit.chains.length}`)
console.log(`removed renamed-to-closed: ${audit.renamedClosed.length}`)
console.log(`renamed (updated): ${audit.renamed.length}`)
console.log(`de-duped (by id): ${audit.deduped.length}`)
console.log(`de-duped (same name, <150m): ${audit.nameMerged.length}`)
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
show('DE-DUPED (by id)', audit.deduped)
show('DE-DUPED (same name, <150m)', audit.nameMerged)
if (audit.noFame.length) show('NO FAME RECORD', audit.noFame)

if (playCap) {
  console.log(
    `\n=== PLAY CAP (top ${playCap} by fame; 40% easy / 40% medium / 20% hard) ===`,
  )
  console.log(
    `in play: ${inPlayCount} of ${outLocations.length}  (benched: ${outLocations.length - inPlayCount}, kept with fame, no difficulty)`,
  )
  console.log(
    `easy=${dist.easy} (fame >= ${easyBound})  medium=${dist.medium}  hard=${dist.hard} (fame <= ${hardBound})`,
  )
} else {
  console.log('\n=== DIFFICULTY (narrow-easy: top 20% / 45% / 35%) ===')
  console.log(
    `easy=${dist.easy} (fame >= ${easyBound})  medium=${dist.medium}  hard=${dist.hard} (fame <= ${hardBound})`,
  )
}
