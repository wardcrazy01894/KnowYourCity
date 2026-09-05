#!/usr/bin/env node
// Generate a self-contained blurb-research Workflow script for one city: the
// locations that still need a write-up are embedded as a literal (same
// crash-safe pattern as gen-fame-workflow.mjs — the harness persists every
// finished batch to agent-*.jsonl, so a session reset loses nothing; recover
// with harvest-blurbs.mjs and regenerate over the MISSING ids).
//
// Research is web/LLM only — Wikipedia, local press, the venue's own site. It
// never touches the Google Places API (owner rule: that quota is reserved for
// open/closed + fame verification). See docs/DATA-SOURCING.md §4f.
//
// Usage:
//   node scripts/gen-blurbs-workflow.mjs <cityId> <out.workflow.js> [batchSize] [--ids a,b,c]
//
// - <cityId>: from cities.json (e.g. stpete). The city label + bounds come from
//   there; the candidates are the IN-PLAY rows of public/locations.<cityId>.json
//   that have no non-placeholder entry in public/blurbs.<cityId>.json.
// - [batchSize]: locations per research agent (default 6 — each needs several
//   searches, so keep batches small).
// - [--ids]: restrict to these ids.
// - [--skip results.json]: exclude ids already present in a (harvested) results
//   file — THE RESUME PATH after a session/token-limit reset: every finished
//   batch is on disk in the workflow's agent-*.jsonl; harvest them, then
//   regenerate over what's left and launch again. Nothing is re-researched.
//
// Resume runbook (also in docs/DATA-SOURCING.md §4f):
//   node scripts/harvest-fame-transcripts.mjs <workflow-dir> scripts/tmp/blurbs-<city>.results.json
//   npm run gen-blurbs -- <city> scripts/tmp/blurbs-<city>.workflow.js --skip scripts/tmp/blurbs-<city>.results.json
//   (launch the new script) … repeat until the generator says nothing is left,
//   then: npm run apply-blurbs -- <city> scripts/tmp/blurbs-<city>.results.json
//   The harvester is merge-mode (seeds from the existing results file), so one
//   accumulating results file spans every run.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { isWritten } from './apply-blurbs-lib.mjs'

const args = process.argv.slice(2)
// Flag VALUES (`--ids a,b`, `--skip file.json`) are not positionals.
const flagValueIdx = new Set(
  ['--ids', '--skip'].map((f) => args.indexOf(f) + 1).filter((i) => i > 0),
)
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !flagValueIdx.has(i),
)
const [CITY, OUT_PATH, BATCH_ARG] = positional
if (!CITY || !OUT_PATH)
  throw new Error(
    'Usage: node scripts/gen-blurbs-workflow.mjs <cityId> <out.workflow.js> [batchSize] [--ids a,b]',
  )
const BATCH = Number(BATCH_ARG) || 6
const idsFlag = args.indexOf('--ids')
const onlyIds =
  idsFlag >= 0 ? new Set(args[idsFlag + 1].split(',').filter(Boolean)) : null
const skipFlag = args.indexOf('--skip')
const skipIds = new Set()
if (skipFlag >= 0) {
  const raw = JSON.parse(readFileSync(args[skipFlag + 1], 'utf8'))
  for (const r of raw.result?.results ?? raw.results ?? raw)
    if (r && typeof r.id === 'string') skipIds.add(r.id)
}

const cities = JSON.parse(
  readFileSync(new URL('../cities.json', import.meta.url), 'utf8'),
)
const city = cities.find((c) => c.id === CITY)
if (!city) throw new Error(`unknown city ${CITY}`)

const { locations } = JSON.parse(
  readFileSync(
    new URL(`../public/locations.${CITY}.json`, import.meta.url),
    'utf8',
  ),
)
const sidecarUrl = new URL(`../public/blurbs.${CITY}.json`, import.meta.url)
const existing = existsSync(sidecarUrl)
  ? JSON.parse(readFileSync(sidecarUrl, 'utf8')).blurbs
  : {}

const tuples = locations
  .filter((l) => l.inPlay !== false)
  .filter((l) => !isWritten(existing[l.id]))
  .filter((l) => !onlyIds || onlyIds.has(l.id))
  .filter((l) => !skipIds.has(l.id))
  .sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0)) // famous first
  .map((l) => [l.id, l.name, l.category, l.lat, l.lng])
if (skipIds.size)
  console.log(`skipping ${skipIds.size} ids already in the results file`)
if (tuples.length === 0)
  throw new Error(
    'nothing to research — every in-play row has a blurb or a result',
  )

const script = `export const meta = {
  name: 'blurbs-${CITY}',
  description: 'Web-research blurbs (why is this place notable / fun fact) for ${city.name} — ${tuples.length} locations, batches of ${BATCH}, each batch fact-checked',
  phases: [{ title: 'Research' }, { title: 'Fact-check' }],
}

const LOCS = ${JSON.stringify(tuples)}
const CITY = ${JSON.stringify(city.name)}
const BATCH = ${BATCH}
const batches = []
for (let i = 0; i < LOCS.length; i += BATCH) batches.push(LOCS.slice(i, i + BATCH))
log(\`blurb research: \${LOCS.length} locations in \${batches.length} batches of \${BATCH}\`)

const ENTRY = {
  type: 'object', additionalProperties: false,
  required: ['id', 'text', 'descriptor', 'sources', 'confidence', 'note'],
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    descriptor: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string' },
  },
}
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['results'],
  properties: { results: { type: 'array', items: ENTRY } },
}

const researchPrompt = (batch, i) => \`You are writing short, accurate "why this place matters" blurbs for a daily map-guessing game about \${CITY}. Players see the blurb AFTER guessing, next to the real location.

For EACH location below, research it on the web (web search + fetch: Wikipedia, the venue's own site, local press like the Tampa Bay Times / Creative Loafing / St. Pete Catalyst / I Love the Burg, the city's own pages, Atlas Obscura). Do NOT use Google Maps/Places APIs.

For each, produce TWO things:
1. descriptor — ONE short factual line (max ~80 characters) saying what kind of place it is: cuisine or style, the neighborhood/street, a signature item or since-year if known. E.g. "Cuban sandwich counter on Central Ave since 1985", "Neighborhood dive bar with a tiki patio", "Waterfront park with a sailing center on Bayboro Harbor". This should exist for essentially EVERY spot — the venue's own site, Yelp/TripAdvisor listings, or a local roundup is enough. Do NOT include star ratings or review counts.
2. text — the story: 1–3 sentences (max ~450 characters) of plain text. Lead with the hook a local would tell a visitor — the history, the claim to fame, a fun fact, what it's known for. No marketing fluff, no "nestled in the heart of". Say "legend says" for folklore. Never state something you did not find in a source. If there is no reliable story (common for neighborhood bars/cafés), set text to "" and confidence "low" — a blank story plus a good descriptor is the correct answer there; an invented fact is the worst answer.

Return one result per id (all \${batch.length}), with 1–2 https source URLs you actually read (no http, no search-result pages), a confidence for the STORY (high = facts confirmed by a solid source; medium = one decent source; low = no usable story), and a one-line note on what you found or why you skipped.

Locations (id | name | category | lat,lng):
\${batch.map(([id, name, cat, lat, lng]) => \`- \${id} | \${name} | \${cat} | \${lat},\${lng}\`).join('\\n')}\`

const checkPrompt = (r) => \`Fact-check these draft blurbs for \${CITY} against their cited sources (fetch each URL). For each: keep the text if every claim is supported; FIX it (minimal edit) if a detail is wrong or unsupported; set text to "" and confidence "low" if the sources don't support the gist or don't load. Check the descriptor too — it must be a plain factual "what kind of place" line (max ~80 chars, no ratings/review counts) supported by a source; fix or trim it, but only blank it if it is actually wrong. Also drop any source URL that is not https or does not actually discuss the place. Keep the story to 1–3 sentences, max ~450 characters, plain text. Return every id.

\${JSON.stringify(r.results, null, 1)}\`

// pipeline() (a documented Workflow hook, unlike the fame pass's parallel+then)
// lets a batch's fact-check start the moment its research finishes. No model
// pin: the fame pass pins sonnet for cheap scoring; blurbs are prose that
// ships to players, so they inherit the session model. The fact-check is
// mechanical (fetch each source, compare) so it runs at low effort — research
// is the expensive stage.
const results = await pipeline(
  batches,
  (batch, _b, i) => agent(researchPrompt(batch, i), { label: \`research:\${i + 1}/\${batches.length}\`, phase: 'Research', schema: SCHEMA }),
  (r, _b, i) => r ? agent(checkPrompt(r), { label: \`check:\${i + 1}/\${batches.length}\`, phase: 'Fact-check', schema: SCHEMA, effort: 'low' }) : null,
)
const all = results.filter(Boolean).flatMap((r) => r.results)
const stories = all.filter((r) => r.text.trim()).length
const described = all.filter((r) => r.descriptor.trim()).length
log(\`done: \${stories} stories, \${described} descriptors over \${all.length} researched; \${LOCS.length - all.length} ids missing (failed batches — harvest + --skip to resume)\`)
return { results: all }
`

writeFileSync(OUT_PATH, script)
console.log(
  `wrote ${OUT_PATH}: ${tuples.length} locations, ${Math.ceil(tuples.length / BATCH)} batches × 2 agents`,
)
