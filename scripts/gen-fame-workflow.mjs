#!/usr/bin/env node
// Generate a self-contained fame-pass Workflow script with the city's
// [id,name,category] tuples embedded as a literal — the crash-safe launch path
// for the add-or-update-city skill's step 3 (see scripts/fame-workflow.template.md
// and scripts/harvest-fame-transcripts.mjs).
//
// Why embed instead of passing via the Workflow tool's `args`? For a big uncapped
// city the tuple set is thousands of entries — far too large to emit by hand into
// an args payload. Generating a script FILE and launching it via `scriptPath`
// keeps the tuples on disk, and the Workflow harness persists each batch's result
// to agent-*.jsonl as it finishes, so a session-limit reset can't lose completed
// work. Recover + resume with harvest-fame-transcripts.mjs, regenerate over the
// MISSING tuples, relaunch.
//
// Usage:
//   node scripts/gen-fame-workflow.mjs <cityLabel> <tuples.json> <out.workflow.js> [batchSize]
//
// - <cityLabel>: human label woven into the rubric, e.g. "Chicago, IL". Edit the
//   anchor icons in ANCHORS below per city for cross-batch score calibration.
// - <tuples.json>: JSON array of [id,name,category] (all, or just the remaining
//   MISSING set on a resume run).
// - <out.workflow.js>: path to write the launchable Workflow script.
// - [batchSize]: locations per agent (default 20).
import { readFileSync, writeFileSync } from 'node:fs'

const [, , CITY_LABEL, TUPLES_PATH, OUT_PATH, BATCH_ARG] = process.argv
if (!CITY_LABEL || !TUPLES_PATH || !OUT_PATH) {
  throw new Error(
    'Usage: node scripts/gen-fame-workflow.mjs <cityLabel> <tuples.json> <out.workflow.js> [batchSize]',
  )
}
const BATCH = Number(BATCH_ARG) || 20
const tuples = JSON.parse(readFileSync(TUPLES_PATH, 'utf8'))
if (!Array.isArray(tuples) || tuples.length === 0)
  throw new Error(`no tuples in ${TUPLES_PATH}`)

// Per-city calibration anchors — well-known local icons with rough scores so
// independent batches land on a comparable 0-100 scale. Edit per city.
const ANCHORS = {
  'Chicago, IL': [
    'Willis Tower ~98',
    'The Art Institute of Chicago ~96',
    'Wrigley Field ~97',
    'Navy Pier ~95',
    'Millennium Park / Cloud Gate ("The Bean") ~96',
    "Garrett Popcorn ~70, Lou Malnati's ~72, Portillo's ~74",
    'a typical neighborhood tavern or taqueria ~30-45',
  ],
}
const anchorLines = (ANCHORS[CITY_LABEL] || [
  '[add 4-6 known local icons with scores]',
])
  .map((a) => `    ${a}`)
  .join('\n')

const script = `export const meta = {
  name: 'fame-assess-${slug(CITY_LABEL)}',
  description: 'Fame + status web-research pass over ${CITY_LABEL} (${tuples.length} locations, batch ${BATCH})',
  phases: [{ title: 'Fame research' }, { title: 'Aggregate' }],
}

const LOCS = ${JSON.stringify(tuples)}
const CITY = ${JSON.stringify(CITY_LABEL)}
const BATCH = ${BATCH}
const batches = []
for (let i = 0; i < LOCS.length; i += BATCH) batches.push(LOCS.slice(i, i + BATCH))
log(\`fame pass: \${LOCS.length} locations in \${batches.length} batches of \${BATCH}\`)

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['results'],
  properties: { results: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id','status','currentName','fameScore','reviewCount','hasWikipedia','isNationalChain','statusNote'],
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['open','closed','renamed','uncertain'] },
      currentName: { type: 'string' },
      fameScore: { type: 'number' },
      reviewCount: { type: 'number' },
      hasWikipedia: { type: 'boolean' },
      isNationalChain: { type: 'boolean' },
      statusNote: { type: 'string' },
    },
  } } },
}

const rubric = (batch) => \`Score places in \${CITY} for a daily map-guessing game. For EACH location use web search (snippets are enough; rely on knowledge for obvious landmarks) and return one result object.
- status: open|closed|renamed|uncertain ('uncertain' = little/no evidence it's a real current public place).
- currentName: new name if renamed else "".
- fameScore 0-100 = how instantly a LONGTIME local recognizes the NAME. Down-weight tourist/critic fame; up-weight local ubiquity. Most restaurants/bars 20-60; 80+ almost exclusively iconic non-food landmarks; obscure/zero-presence <12. Anchors:
${anchorLines}
- reviewCount: approx Google/Yelp count (0 if unknown).
- hasWikipedia: true only if it has its own Wikipedia article.
- isNationalChain: true for genuine national chains (Sbarro, DQ, Auntie Anne's, Starbucks, ...); local/regional mini-chains = false.
- statusNote: one short clause.
Return EXACTLY one result per id. Locations (id | name | category):
\${batch.map((b) => \`\${b[0]} | \${b[1]} | \${b[2]}\`).join('\\n')}\`

const results = await parallel(batches.map((batch, i) => () =>
  agent(rubric(batch), { label: \`fame:batch\${i + 1}\`, phase: 'Fame research', model: 'sonnet', schema: SCHEMA })
    .then((r) => (r && r.results ? r.results : []))))

phase('Aggregate')
const flat = results.filter(Boolean).flat()
log(\`collected \${flat.length} fame results from \${batches.length} batches\`)
return { results: flat }
`

writeFileSync(OUT_PATH, script)
console.log(
  `wrote ${OUT_PATH}: ${tuples.length} tuples, ${Math.ceil(tuples.length / BATCH)} batches of ${BATCH}`,
)

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
