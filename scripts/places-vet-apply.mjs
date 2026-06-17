#!/usr/bin/env node
// Apply a full freshness+vetting pass for one city. Two inputs:
//   1. the Places sweep results (data/.places-<city>.jsonl)
//   2. the hard-tail verification decisions (a JSON {decisions:[{id,decision,...}]}
//      from the verify-hardtail workflow), filtered to this city.
//
// For every committed row that still lacks `lastVerified`:
//   - if the workflow ruled on it: keep -> stamp; remove -> status:closed in the
//     fame cache (apply-difficulty drops it); repin -> move coords (+stamp).
//   - else (the auto-resolved tier) reclassify the stored sweep record with the
//     CURRENT matcher (scripts/places-freshness-lib.mjs): stamp -> lastVerified,
//     food CLOSED_PERMANENTLY -> status:closed.
// Curated fameScore is never rewritten; Google fields stay in the gitignored
// scratch. After this, run `node scripts/apply-difficulty.mjs <city>`.
//
// Usage: node scripts/places-vet-apply.mjs --city <id> --decisions <file> [--date YYYY-MM-DD] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import prettier from 'prettier'
import { classifyFromStored, shouldAutoClose } from './places-freshness-lib.mjs'

const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const CITY = getArg('--city')
if (!CITY)
  throw new Error(
    'Usage: node scripts/places-vet-apply.mjs --city <id> --decisions <file> [--dry]',
  )
const DRY = args.includes('--dry')
const DATE = getArg('--date') || new Date().toISOString().slice(0, 10)
const DECISIONS_FILE = getArg('--decisions')

const RESULTS = new URL(`../data/.places-${CITY}.jsonl`, import.meta.url)
const DATASET = new URL(`../public/locations.${CITY}.json`, import.meta.url)
const CACHE = new URL(`../data/fame-${CITY}.json`, import.meta.url)
const REPORT = new URL(`../data/.places-${CITY}-vet-report.md`, import.meta.url)

const results = existsSync(RESULTS)
  ? readFileSync(RESULTS, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
  : []
const resultById = new Map(results.map((r) => [r.id, r]))
const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const fame = JSON.parse(readFileSync(CACHE, 'utf8'))
const fameById = new Map(fame.map((f) => [f.id, f]))

// Decisions: {decisions:[{id,decision,confidence,reason,repinLat,repinLng}]}; keep
// only this city's (ids are unique per city dataset, but filter by membership).
const dsIds = new Set(ds.locations.map((l) => l.id))
let decisions = []
if (DECISIONS_FILE && existsSync(DECISIONS_FILE)) {
  const raw = JSON.parse(readFileSync(DECISIONS_FILE, 'utf8'))
  decisions = (raw.decisions || raw).filter((d) => dsIds.has(d.id))
}
const decisionById = new Map(decisions.map((d) => [d.id, d]))

const out = {
  stamped: [],
  removed: [],
  repinned: [],
  closedFood: [],
  leftover: [],
}

// Mark a row removed by setting its fame status to 'closed' so apply-difficulty
// drops it. Some dataset rows have no fame record (the noFame tier) — synthesize
// a minimal closed entry so the drop still takes effect on re-run.
function markClosed(id, note) {
  const f = fameById.get(id)
  if (f) {
    f.status = 'closed'
    f.statusNote = note
    return
  }
  const entry = {
    id,
    status: 'closed',
    currentName: '',
    fameScore: 0,
    reviewCount: 0,
    hasWikipedia: false,
    isNationalChain: false,
    statusNote: note,
  }
  fame.push(entry)
  fameById.set(id, entry)
}

for (const row of ds.locations) {
  if (row.lastVerified) continue // already verified (prior pass) — leave it
  const d = decisionById.get(row.id)
  if (d) {
    if (d.decision === 'remove') {
      markClosed(
        row.id,
        `Removed via vetting ${DATE} (${d.confidence}): ${d.reason}`.slice(
          0,
          240,
        ),
      )
      out.removed.push({ id: row.id, name: row.name, reason: d.reason })
    } else if (
      d.decision === 'repin' &&
      typeof d.repinLat === 'number' &&
      typeof d.repinLng === 'number'
    ) {
      row.lat = d.repinLat
      row.lng = d.repinLng
      row.lastVerified = DATE
      out.repinned.push({ id: row.id, name: row.name, reason: d.reason })
    } else {
      // keep (or repin without coords) -> stamp present
      row.lastVerified = DATE
      out.stamped.push(row.id)
    }
    continue
  }
  // Auto-resolved tier: reclassify the stored sweep record with the current matcher.
  const rec = resultById.get(row.id)
  if (!rec) {
    out.leftover.push({
      id: row.id,
      name: row.name,
      why: 'no sweep record + no decision',
    })
    continue
  }
  const cl = classifyFromStored(rec, row)
  if (cl.action === 'stamp') {
    row.lastVerified = DATE
    out.stamped.push(row.id)
  } else if (cl.action === 'close' && shouldAutoClose(row.category)) {
    markClosed(
      row.id,
      `Permanently closed per Google Places (verified ${DATE})`,
    )
    out.closedFood.push({ id: row.id, name: row.name })
  } else {
    out.leftover.push({
      id: row.id,
      name: row.name,
      why: `${cl.verdict}/${cl.action} (no decision)`,
    })
  }
}

async function writeJson(url, obj) {
  const cfg = await prettier.resolveConfig(url.pathname)
  writeFileSync(
    url,
    await prettier.format(JSON.stringify(obj, null, 2), {
      ...cfg,
      parser: 'json',
    }),
  )
}
if (!DRY) {
  await writeJson(DATASET, ds)
  await writeJson(CACHE, fame)
}

const lines = [`# Vetting apply — ${CITY} (${DATE})`, '']
lines.push(`- stamped (kept/verified present): **${out.stamped.length}**`)
lines.push(`- removed (workflow): **${out.removed.length}**`)
lines.push(`- repinned (workflow): **${out.repinned.length}**`)
lines.push(
  `- auto-closed food (Google CLOSED_PERMANENTLY): **${out.closedFood.length}**`,
)
lines.push(
  `- LEFTOVER (still unresolved — should be 0): **${out.leftover.length}**`,
  '',
)
const sec = (t, a, f) => {
  lines.push(`## ${t} (${a.length})`)
  a.forEach((x) => lines.push(`- ${f(x)}`))
  lines.push('')
}
sec('Removed', out.removed, (x) => `${x.name} (${x.id}) — ${x.reason}`)
sec('Repinned', out.repinned, (x) => `${x.name} (${x.id}) — ${x.reason}`)
sec('Auto-closed food', out.closedFood, (x) => `${x.name} (${x.id})`)
sec('LEFTOVER', out.leftover, (x) => `${x.name} (${x.id}) — ${x.why}`)
if (!DRY) writeFileSync(REPORT, lines.join('\n') + '\n')

console.log(
  `${DRY ? '[dry] ' : ''}${CITY}: stamped=${out.stamped.length} removed=${out.removed.length} repinned=${out.repinned.length} closedFood=${out.closedFood.length} leftover=${out.leftover.length}`,
)
if (out.leftover.length)
  console.log(
    '  ⚠️ leftover ids:',
    out.leftover
      .slice(0, 20)
      .map((x) => x.id)
      .join(', '),
  )
