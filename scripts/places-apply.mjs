#!/usr/bin/env node
// Apply a Places freshness sweep (scripts/places-freshness.mjs) to the committed
// data. Conservative by design:
//   - action 'stamp'  (matched + OPERATIONAL)      -> set lastVerified on the row
//   - action 'close'  (matched + CLOSED_PERMANENTLY)-> status:closed in the fame
//                                                      cache (apply-difficulty drops it)
//   - action 'watch'  (CLOSED_TEMPORARILY)          -> leave as-is, no stamp (watch-list)
//   - action 'review' (ambiguous / not_found / err) -> leave as-is, listed in the report
//
// We never auto-rename and never rewrite the curated fameScore — those need a
// per-venue look. Fame drift (current Google review count vs the cached count) is
// reported only. After this, re-run `node scripts/apply-difficulty.mjs <city>` to
// drop the closures and recompute the play cap.
//
// Usage: node scripts/places-apply.mjs --city seattle [--date YYYY-MM-DD] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import prettier from 'prettier'
import { driftFlag, shouldAutoClose } from './places-freshness-lib.mjs'

const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const CITY = getArg('--city')
if (!CITY)
  throw new Error(
    'Usage: node scripts/places-apply.mjs --city <id> [--date YYYY-MM-DD] [--dry]',
  )
const DRY = args.includes('--dry')
const DATE = getArg('--date') || new Date().toISOString().slice(0, 10)

const RESULTS = new URL(`../data/.places-${CITY}.jsonl`, import.meta.url)
const DATASET = new URL(`../public/locations.${CITY}.json`, import.meta.url)
const CACHE = new URL(`../data/fame-${CITY}.json`, import.meta.url)
const REPORT = new URL(`../data/.places-${CITY}-report.md`, import.meta.url)

if (!existsSync(RESULTS))
  throw new Error(
    `No results at ${RESULTS.pathname} — run places-freshness.mjs first`,
  )

// ---- load ----
const results = readFileSync(RESULTS, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
const ds = JSON.parse(readFileSync(DATASET, 'utf8'))
const dsById = new Map(ds.locations.map((l) => [l.id, l]))
const fame = JSON.parse(readFileSync(CACHE, 'utf8'))
const fameById = new Map(fame.map((f) => [f.id, f]))

// ---- apply ----
const stamped = []
const closed = []
const watch = []
const review = []
const drift = []
const missingRow = []

for (const r of results) {
  // fame drift is informational regardless of action
  if (r.userRatingCount != null) {
    const f = fameById.get(r.id)
    // Tight thresholds: only surface high-volume, large swings worth a per-venue
    // recalibration. The cached counts were coarse, so a loose flag is all noise.
    const d = driftFlag(f?.reviewCount, r.userRatingCount, {
      minNew: 500,
      ratio: 3,
    })
    if (d) drift.push({ id: r.id, name: r.name, ...d })
  }

  if (r.action === 'stamp') {
    const row = dsById.get(r.id)
    if (!row) {
      missingRow.push(r.id)
      continue
    }
    row.lastVerified = DATE
    stamped.push(r.id)
  } else if (r.action === 'close') {
    // Only auto-drop a permanent closure for a trusted business category. Google
    // flags delisted park/landmark POIs as CLOSED_PERMANENTLY though the place
    // still stands — route those to review instead.
    const cat = dsById.get(r.id)?.category
    if (!shouldAutoClose(cat)) {
      review.push({
        id: r.id,
        name: r.name,
        verdict: `closed?(${cat})`,
        candidateName: r.candidateName,
        distanceM: r.distanceM != null ? Math.round(r.distanceM) : null,
        nameSim: r.nameSim,
      })
      continue
    }
    const f = fameById.get(r.id)
    if (f) {
      f.status = 'closed'
      f.statusNote = `Permanently closed per Google Places (verified ${DATE})`
    }
    closed.push({ id: r.id, name: r.name })
  } else if (r.action === 'watch') {
    watch.push({ id: r.id, name: r.name, businessStatus: r.businessStatus })
  } else {
    review.push({
      id: r.id,
      name: r.name,
      verdict: r.verdict,
      candidateName: r.candidateName,
      distanceM: r.distanceM != null ? Math.round(r.distanceM) : null,
      nameSim: r.nameSim,
    })
  }
}

// ---- write dataset + cache (unless dry) ----
async function writeJson(url, obj) {
  const cfg = await prettier.resolveConfig(url.pathname)
  const formatted = await prettier.format(JSON.stringify(obj, null, 2), {
    ...cfg,
    parser: 'json',
  })
  writeFileSync(url, formatted)
}
if (!DRY) {
  await writeJson(DATASET, ds)
  await writeJson(CACHE, fame)
}

// ---- report ----
const lines = []
lines.push(`# Places freshness sweep — ${CITY} (${DATE})`)
lines.push('')
lines.push(`- results processed: **${results.length}**`)
lines.push(`- stamped lastVerified (operational): **${stamped.length}**`)
lines.push(
  `- newly marked CLOSED (status:closed in fame cache): **${closed.length}**`,
)
lines.push(
  `- temporarily-closed (watch-list, not stamped): **${watch.length}**`,
)
lines.push(
  `- needs review (ambiguous / not found / error): **${review.length}**`,
)
lines.push(
  `- fame-drift flags (review count moved a lot — recalibrate per-venue): **${drift.length}**`,
)
if (missingRow.length)
  lines.push(
    `- ⚠️ stamp results with no matching dataset row: ${missingRow.length}`,
  )
lines.push('')
const section = (title, arr, fmt) => {
  lines.push(`## ${title} (${arr.length})`)
  arr.forEach((x) => lines.push(`- ${fmt(x)}`))
  lines.push('')
}
section('Newly CLOSED', closed, (x) => `${x.name} (${x.id})`)
section(
  'Temporarily closed (watch)',
  watch,
  (x) => `${x.name} (${x.id}) — ${x.businessStatus}`,
)
section(
  'Fame drift (recalibrate later)',
  drift,
  (x) => `${x.name} (${x.id}) — ${x.old} → ${x.new} reviews (×${x.ratio})`,
)
section(
  'Needs review',
  review,
  (x) =>
    `${x.name} (${x.id}) — ${x.verdict}; google="${x.candidateName ?? '∅'}" dist=${x.distanceM ?? '∅'}m sim=${x.nameSim ?? '∅'}`,
)
const report = lines.join('\n') + '\n'
if (!DRY) writeFileSync(REPORT, report)

console.log(report.split('\n').slice(0, 9).join('\n'))
console.log(
  `${DRY ? '[dry-run] ' : ''}stamped=${stamped.length} closed=${closed.length} watch=${watch.length} review=${review.length} drift=${drift.length}`,
)
if (!DRY) {
  console.log(`report: ${REPORT.pathname}`)
  console.log(`\nNext: node scripts/apply-difficulty.mjs ${CITY}`)
}
