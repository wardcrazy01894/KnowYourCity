#!/usr/bin/env node
// Merge blurb-research results into a city's sidecar (public/blurbs.<city>.json).
//
// Input is the `{ results: [...] }` a gen-blurbs-workflow.mjs run returns — or,
// after a crash, what `harvest-fame-transcripts.mjs <workflow-dir> <out.json>`
// recovers from the agent transcripts (it's generic: any StructuredOutput with
// `results[].id`; the fact-check stage runs last so its rows win).
//
// Rules (docs/DATA-SOURCING.md §4f): keep rows with a story (confidence
// high|medium) and/or a factual descriptor, https sources only, capped; never
// overwrite an existing hand-written entry unless --force; every merged entry
// gets its writtenFor snapshot via syncBlurbs(accept). Skipped rows are listed
// so the tail can be re-run or hand-written.
//
//   node scripts/apply-blurbs.mjs <cityId> <results.json> [--force] [--dry-run]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'
import { syncBlurbs } from './sync-blurbs-lib.mjs'
import { normalizeBlurbResults, MAX_CHARS } from './apply-blurbs-lib.mjs'

const args = process.argv.slice(2)
const [CITY, RESULTS] = args.filter((a) => !a.startsWith('--'))
if (!CITY || !RESULTS)
  throw new Error(
    'Usage: node scripts/apply-blurbs.mjs <cityId> <results.json> [--force] [--dry-run]',
  )
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

const SIDECAR = new URL(`../public/blurbs.${CITY}.json`, import.meta.url)
const DATASET = new URL(`../public/locations.${CITY}.json`, import.meta.url)
const { locations } = JSON.parse(readFileSync(DATASET, 'utf8'))
const file = existsSync(SIDECAR)
  ? JSON.parse(readFileSync(SIDECAR, 'utf8'))
  : { version: 1, city: CITY, blurbs: {} }
const raw = JSON.parse(readFileSync(RESULTS, 'utf8'))
const rows = raw.result?.results ?? raw.results ?? raw

const { accepted, skipped } = normalizeBlurbResults(rows, {
  knownIds: new Set(locations.map((l) => l.id)),
  existing: file.blurbs,
  force,
})
for (const { id, text, descriptor, sources } of accepted)
  file.blurbs[id] = { ...(file.blurbs[id] ?? {}), text, descriptor, sources }

const today = new Date().toISOString().slice(0, 10)
const { file: out, audit } = syncBlurbs(file, locations, {
  accept: accepted.map((a) => a.id),
  today,
})

console.log(
  `merged ${accepted.length} blurbs into ${CITY} (max ${MAX_CHARS} chars)`,
)
for (const [why, ids] of Object.entries(skipped))
  if (ids.length)
    console.log(`skipped — ${why} (${ids.length}): ${ids.join(', ')}`)
if (audit.stale.length)
  console.log(`still needing review: ${audit.stale.join(', ')}`)
console.log(
  `sidecar now: ${Object.keys(out.blurbs).length} blurbs of ${locations.filter((l) => l.inPlay !== false).length} in-play locations`,
)
if (dryRun) process.exit(0)

const path = fileURLToPath(SIDECAR)
writeFileSync(
  SIDECAR,
  await prettier.format(JSON.stringify(out, null, 2), {
    ...(await prettier.resolveConfig(path)),
    parser: 'json',
  }),
)
console.log(`wrote public/blurbs.${CITY}.json`)
