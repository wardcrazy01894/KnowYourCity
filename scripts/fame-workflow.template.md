# Fame-assessment workflow template

Used by the `add-or-update-city` skill (step 3). Pass the city's locations as the
`Workflow` tool's `args` — an array of `[id, name, category]` tuples (generate
with the snippet below) — then save the returned `{results}` to
`/tmp/fame-<id>.json` and feed `node scripts/apply-difficulty.mjs <id> /tmp/fame-<id>.json`.

Generate the tuples to pass as `args`:

```bash
node -e "const d=require('./public/locations.<id>.json').locations;process.stdout.write(JSON.stringify(d.map(l=>[l.id,l.name,l.category])))"
```

Workflow script (edit `CITY` and the rubric anchors per city):

```js
export const meta = {
  name: 'fame-assess',
  description: 'Fame + status web-research pass over a city's locations',
  phases: [{ title: 'Fame research' }, { title: 'Aggregate' }],
}

// args may arrive as a JSON string — parse defensively.
const LOCS = typeof args === 'string' ? JSON.parse(args) : args // [[id,name,category],...]
const CITY = 'State College, PA (home of Penn State University)' // <-- edit per city
const BATCH = 20
const batches = []
for (let i = 0; i < LOCS.length; i += BATCH) batches.push(LOCS.slice(i, i + BATCH))

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

const rubric = (batch) => `Score places in ${CITY} for a daily map-guessing game. For EACH location use web search (snippets are enough; rely on knowledge for obvious landmarks) and return one result object.
- status: open|closed|renamed|uncertain ('uncertain' = little/no evidence it's a real current public place).
- currentName: new name if renamed else "".
- fameScore 0-100 = how instantly a LONGTIME local recognizes the NAME. Down-weight tourist/critic fame; up-weight local ubiquity. Most restaurants/bars 20-60; 80+ almost exclusively iconic non-food landmarks; obscure/zero-presence <12. [Anchor 4-6 known local icons here with scores.]
- reviewCount: approx Google/Yelp count (0 if unknown).
- hasWikipedia: true only if it has its own Wikipedia article.
- isNationalChain: true for genuine national chains (Sbarro, DQ, Auntie Anne's, ...); local/regional mini-chains = false.
- statusNote: one short clause.
Return EXACTLY one result per id. Locations (id | name | category):
${batch.map((b) => `${b[0]} | ${b[1]} | ${b[2]}`).join('\n')}`

const results = await parallel(batches.map((batch, i) => () =>
  agent(rubric(batch), { label: `fame:batch${i + 1}`, phase: 'Fame research', model: 'sonnet', schema: SCHEMA })
    .then((r) => (r && r.results ? r.results : []))))

phase('Aggregate')
const flat = results.filter(Boolean).flat()
log(`collected ${flat.length} fame results from ${batches.length} batches`)
return { results: flat }
```

After it completes, write the result and enrich:

```bash
# (save the workflow's returned {results} JSON to /tmp/fame-<id>.json first)
node scripts/apply-difficulty.mjs <id> /tmp/fame-<id>.json
```
