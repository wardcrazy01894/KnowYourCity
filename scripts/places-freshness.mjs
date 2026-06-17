#!/usr/bin/env node
// Google Places freshness/validation sweep for one city.
//
// For every committed location that lacks a `lastVerified` stamp, query the
// Places API (New) Text Search, pick the best-matching candidate, and classify
// it (operational / closed / temporarily-closed / ambiguous / not-found) via the
// pure rules in ./places-freshness-lib.mjs. Results stream to a gitignored
// scratch JSONL so the run is fully resumable — re-running skips ids already in
// the file. This script ONLY fetches + classifies; `--apply` (places-apply.mjs)
// turns the results into committed lastVerified stamps + status changes.
//
// We use Google solely to verify (open/closed + identity) and to spot fame
// drift; per Places ToS the Google-derived fields live only in the scratch file,
// never in the committed dataset.
//
// Usage:
//   node scripts/places-freshness.mjs --city seattle [--limit N] [--concurrency 8]
//   GOOGLE_MAPS_KEY is read from the environment or .env.local.
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { classifyVenue, nameSimilarity } from './places-freshness-lib.mjs'

const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const CITY = getArg('--city')
if (!CITY)
  throw new Error(
    'Usage: node scripts/places-freshness.mjs --city <id> [--limit N]',
  )
const LIMIT = getArg('--limit') ? Number(getArg('--limit')) : Infinity
const CONCURRENCY = Number(getArg('--concurrency', '8'))
const RADIUS = Number(getArg('--radius', '3000'))
const OUT = new URL(`../data/.places-${CITY}.jsonl`, import.meta.url)

// ---- key (env or .env.local, never logged) ----
function loadKey() {
  if (process.env.GOOGLE_MAPS_KEY) return process.env.GOOGLE_MAPS_KEY.trim()
  const envPath = new URL('../.env.local', import.meta.url)
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf8').match(/GOOGLE_MAPS_KEY\s*=\s*(.+)/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('GOOGLE_MAPS_KEY not set (env or .env.local)')
}
const KEY = loadKey()

// ---- city display name for the text query suffix ----
const CITIES = JSON.parse(
  readFileSync(new URL('../cities.json', import.meta.url), 'utf8'),
)
const cityRow = CITIES.find((c) => c.id === CITY)
const cityQuery = cityRow?.name || CITY // e.g. "Seattle, WA"

// ---- dataset + targets (rows missing lastVerified) ----
const ds = JSON.parse(
  readFileSync(
    new URL(`../public/locations.${CITY}.json`, import.meta.url),
    'utf8',
  ),
)
const targets = ds.locations.filter((l) => !l.lastVerified).slice(0, LIMIT)

// ---- resume: skip ids already recorded ----
const done = new Set()
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      done.add(JSON.parse(line).id)
    } catch {
      /* ignore a torn last line */
    }
  }
}
const pending = targets.filter((t) => !done.has(t.id))
console.error(
  `[places] ${CITY}: ${targets.length} targets, ${done.size} already done, ${pending.length} to fetch (concurrency ${CONCURRENCY})`,
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function searchText(venue, attempt = 0) {
  const body = {
    textQuery: `${venue.name}, ${cityQuery}`,
    locationBias: {
      circle: {
        center: { latitude: venue.lat, longitude: venue.lng },
        radius: RADIUS,
      },
    },
    maxResultCount: 3,
  }
  const res = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.businessStatus,places.formattedAddress,places.location,places.userRatingCount',
      },
      body: JSON.stringify(body),
    },
  )
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`Places API ${res.status} after retries`)
    await sleep(500 * 2 ** attempt)
    return searchText(venue, attempt + 1)
  }
  const j = await res.json()
  if (!res.ok)
    throw new Error(
      `Places API ${res.status}: ${JSON.stringify(j).slice(0, 200)}`,
    )
  return j.places || []
}

function processVenue(venue, places) {
  // Pick the candidate with the best name match to our row (Places ranks by
  // relevance, but the closest name is the right identity to judge against).
  const cands = places.map((p) => ({
    id: p.id,
    displayName: p.displayName?.text || '',
    businessStatus: p.businessStatus,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    userRatingCount: p.userRatingCount,
  }))
  let best = null
  let bestSim = -1
  for (const c of cands) {
    const s = nameSimilarity(venue.name, c.displayName)
    if (s > bestSim) {
      bestSim = s
      best = c
    }
  }
  const verdict = classifyVenue(venue, best)
  return {
    id: venue.id,
    name: venue.name,
    inPlay: venue.inPlay !== false,
    ...verdict,
    placeId: best?.id ?? null,
    candidateName: best?.displayName ?? null,
    userRatingCount: best?.userRatingCount ?? null,
  }
}

// ---- bounded-concurrency worker pool ----
let idx = 0
let completed = 0
const tally = {}
async function worker() {
  while (idx < pending.length) {
    const venue = pending[idx++]
    try {
      const places = await searchText(venue)
      const rec = processVenue(venue, places)
      appendFileSync(OUT, JSON.stringify(rec) + '\n')
      tally[rec.verdict] = (tally[rec.verdict] || 0) + 1
    } catch (e) {
      appendFileSync(
        OUT,
        JSON.stringify({
          id: venue.id,
          name: venue.name,
          verdict: 'error',
          action: 'review',
          error: String(e.message || e),
        }) + '\n',
      )
      tally.error = (tally.error || 0) + 1
    }
    if (++completed % 100 === 0)
      console.error(
        `[places] ${completed}/${pending.length} — ${JSON.stringify(tally)}`,
      )
  }
}

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, worker),
)
console.error(
  `[places] DONE ${completed}/${pending.length}. verdicts: ${JSON.stringify(tally)}`,
)
console.error(`[places] results: ${OUT.pathname}`)
