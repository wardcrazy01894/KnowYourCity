#!/usr/bin/env node
// Crash-safe harvester for the agentic fame pass (add-or-update-city step 3).
//
// The fame Workflow fans out one schema-validated agent per batch; the harness
// persists each agent's full conversation to `agent-<id>.jsonl` in the workflow
// transcript dir AS IT RUNS. Each agent's final answer is a `StructuredOutput`
// tool call whose input is `{ results: [...] }`. So even if the session or the
// Workflow tool dies before returning, every COMPLETED batch's results are on
// disk and can be recovered here — no re-research of finished batches.
//
// Usage:
//   node scripts/harvest-fame-transcripts.mjs <dir> <out.json> [tuples.json]
//
// - <dir>: either a single workflow transcript dir (…/workflows/wf_<id>/) or a
//   PARENT dir (…/subagents/workflows/) — this recurses, so a follow-up
//   workflow's agent-*.jsonl files (in a NEW wf_ dir) are merged automatically.
// - <out.json>: where to write the merged { results: [...] } (feed to
//   apply-difficulty.mjs).
// - [tuples.json] (optional): the [id,name,category] tuples the workflow scored;
//   if given, prints which ids are still MISSING and writes the remaining tuples
//   to <out>.missing-tuples.json so a follow-up workflow can cover just those.
//   (Tuples are reproducible: derive from public/locations.<id>.json.)
//
// Re-runnable and idempotent: dedupes by id (last write wins). Safe to run
// repeatedly while a workflow is still going to snapshot partial progress.
// MERGE MODE: if <out.json> already exists, its results are loaded first, then
// the scanned transcripts are merged on top — so you can harvest from several
// workflow dirs (e.g. across a session boundary) into one accumulating file.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2]
const OUT = process.argv[3]
const TUPLES = process.argv[4]
if (!DIR || !OUT) {
  throw new Error(
    'Usage: node scripts/harvest-fame-transcripts.mjs <dir> <out.json> [tuples.json]',
  )
}

// Recursively collect every agent-*.jsonl under DIR (handles single wf_ dir or
// the parent workflows/ dir containing multiple wf_ runs).
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) out.push(...walk(p))
    else if (entry.startsWith('agent-') && entry.endsWith('.jsonl')) out.push(p)
  }
  return out
}
const files = walk(DIR)

// id -> record (last StructuredOutput result wins)
const byId = new Map()
let agentsWithOutput = 0
let totalResultRows = 0

// Merge mode: seed from an existing out file so harvests accumulate.
let seeded = 0
if (existsSync(OUT)) {
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'))
    for (const r of prev.results ?? prev) {
      if (r && typeof r.id === 'string') {
        byId.set(r.id, r)
        seeded++
      }
    }
  } catch {
    /* ignore unreadable seed */
  }
}

for (const f of files) {
  let text
  try {
    text = readFileSync(f, 'utf8')
  } catch {
    continue
  }
  let found = false
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const content = o.message?.content || o.content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (c.type === 'tool_use' && c.name === 'StructuredOutput') {
        const rows = c.input?.results
        if (Array.isArray(rows)) {
          found = true
          for (const r of rows) {
            if (r && typeof r.id === 'string') {
              byId.set(r.id, r)
              totalResultRows++
            }
          }
        }
      }
    }
  }
  if (found) agentsWithOutput++
}

const results = [...byId.values()]
writeFileSync(OUT, JSON.stringify({ results }, null, 2) + '\n')

if (seeded) console.log(`seeded from existing ${OUT}: ${seeded} ids`)
console.log(`agent jsonl files scanned: ${files.length}`)
console.log(`agents with StructuredOutput: ${agentsWithOutput}`)
console.log(`result rows seen (pre-dedupe): ${totalResultRows}`)
console.log(`unique ids harvested: ${results.length}`)
console.log(`wrote ${OUT}`)

if (TUPLES) {
  const tuples = JSON.parse(readFileSync(TUPLES, 'utf8'))
  const want = new Set(tuples.map((t) => t[0]))
  const have = new Set(byId.keys())
  const missing = [...want].filter((id) => !have.has(id))
  const extra = [...have].filter((id) => !want.has(id))
  console.log(`\nexpected ids: ${want.size}`)
  console.log(`MISSING (not yet scored): ${missing.length}`)
  if (extra.length)
    console.log(`unexpected ids (not in tuples): ${extra.length}`)
  if (missing.length) {
    const missTuples = tuples.filter((t) => !have.has(t[0]))
    const MISS_OUT = OUT.replace(/\.json$/, '') + '.missing-tuples.json'
    writeFileSync(MISS_OUT, JSON.stringify(missTuples))
    console.log(`wrote remaining tuples for a follow-up pass: ${MISS_OUT}`)
  }
}
