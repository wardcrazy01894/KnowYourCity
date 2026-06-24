// @ts-check
/**
 * assign-flagship-pins.mjs — make each chain's IN-PLAY entry represent its most
 * famous (most-reviewed) branch.
 *
 * The original per-chain entry carried a brand-level fame attached to whatever
 * branch the build happened to keep — often a minor one (e.g. Top Pot's Capitol
 * Hill, 474 reviews, while the 2,923-review Downtown flagship sat benched). This
 * permutes the LOCATION each entry of a brand points to — coords, name, source,
 * lastVerified — pairing the in-play entries with the highest Google-review-count
 * locations, and hands out the brand's fame scores highest-first in that same
 * order so the flagship always carries the top fame (never a benched sibling).
 * Each entry keeps its `id` and `inPlay`, and the per-brand SET of fame scores is
 * unchanged, so the play-cap and difficulty distribution are untouched — the
 * in-play slot just lands on the flagship branch.
 *
 * Only GENUINE multi-location chains are touched (shared isMultiLocation guard) —
 * a prefix collision of different businesses ("LTD" vs "LTD Edition Sushi") is
 * left alone.
 *
 * Run after add-chain-branches.mjs (and apply-difficulty for a loose-cap city):
 *   node scripts/assign-flagship-pins.mjs            (all cities)
 *   node scripts/assign-flagship-pins.mjs <cityId> [--dry]
 *
 * Per-pin review counts come from Google Places (hard-boxed to the pin) and are
 * cached in data/.chain-reviews-cache.json, so re-runs are free.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import prettier from 'prettier'
import {
  normalizeBusinessName,
  haversineMeters,
} from './apply-difficulty-lib.mjs'
import { countOsmBranches } from './detect-chains.mjs'
import {
  FOOD,
  baseOf,
  brandGroups,
  canonicalBase,
  isMultiLocation,
  isNationalBrand,
  nameMatches,
} from './chain-grouping.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const inPlay = (l) => l.inPlay !== false
// Location-identifying fields that travel together when a branch is reassigned.
const LOC_FIELDS = [
  'lat',
  'lng',
  'name',
  'source',
  'attribution',
  'lastVerified',
]

const KEY = (() => {
  try {
    const m = readFileSync(
      new URL('../.env.local', import.meta.url),
      'utf8',
    ).match(/^GOOGLE_MAPS_KEY=(.+)$/m)
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''
  } catch {
    return ''
  }
})()
const RCACHE = new URL('../data/.chain-reviews-cache.json', import.meta.url)
const rcache = existsSync(RCACHE)
  ? JSON.parse(readFileSync(RCACHE, 'utf8'))
  : {}

/** Accurate per-pin Google review count (hard-boxed to the pin). Only counts a
 *  match whose NAME carries the brand's distinctive tokens, so a co-located
 *  sibling concept doesn't pollute it. Cached. */
async function reviewCount(name, lat, lng, cityQuery, cityTokens) {
  const ck = `${name}@${lat.toFixed(5)},${lng.toFixed(5)}`
  if (ck in rcache) return rcache[ck]
  const d = 0.003
  const res = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.userRatingCount,places.location,places.displayName',
      },
      body: JSON.stringify({
        textQuery: `${name}, ${cityQuery}`,
        locationRestriction: {
          rectangle: {
            low: { latitude: lat - d, longitude: lng - d },
            high: { latitude: lat + d, longitude: lng + d },
          },
        },
        maxResultCount: 10,
      }),
    },
  )
  const ps = (await res.json()).places ?? []
  let best = null
  let bd = Infinity
  for (const p of ps) {
    if (!p.location) continue
    if (!nameMatches(p.displayName?.text ?? '', name, cityTokens)) continue
    const dm = haversineMeters(
      { lat, lng },
      { lat: p.location.latitude, lng: p.location.longitude },
    )
    if (dm < bd) {
      bd = dm
      best = p
    }
  }
  const rc = best && bd <= 200 ? (best.userRatingCount ?? 0) : 0
  rcache[ck] = rc
  writeFileSync(RCACHE, JSON.stringify(rcache))
  await sleep(110)
  return rc
}

async function processCity(cityId, cities, dry) {
  const city = cities.find((c) => c.id === cityId)
  const cityTokens = [
    ...new Set(
      [city?.short, (city?.name || '').split(',')[0]]
        .filter(Boolean)
        .map((s) => normalizeBusinessName(s)),
    ),
  ]
  const dsUrl = new URL(`../public/locations.${cityId}.json`, import.meta.url)
  const ds = JSON.parse(await readFile(dsUrl, 'utf8'))
  const rows = ds.locations.filter((l) => FOOD.has(l.category))

  // chain-detection inputs (same as add-chain-branches / normalize-chains)
  const osmUrl = new URL(`../data/.osm-food.${cityId}.json`, import.meta.url)
  const osm = existsSync(osmUrl) ? JSON.parse(readFileSync(osmUrl, 'utf8')) : []
  const osmCounts = countOsmBranches(osm, cityTokens)
  const natTokens = JSON.parse(
    await readFile(
      new URL('../data/national-chains.json', import.meta.url),
      'utf8',
    ),
  ).chains
  const fameNatIds = new Set()
  const fameUrl = new URL(`../data/fame-${cityId}.json`, import.meta.url)
  if (existsSync(fameUrl))
    for (const r of JSON.parse(readFileSync(fameUrl, 'utf8')))
      if (r.isNationalChain) fameNatIds.add(r.id)

  // Existing fame→difficulty thresholds for the in-play set, so a promoted branch
  // lands in the right tier without re-bucketing the whole city.
  const playing = ds.locations.filter(inPlay)
  const easyFames = playing
    .filter((l) => l.difficulty === 'easy')
    .map((l) => l.fameScore)
  const hardFames = playing
    .filter((l) => l.difficulty === 'hard')
    .map((l) => l.fameScore)
  if (!easyFames.length || !hardFames.length)
    console.warn(
      `⚠️  ${cityId}: in-play set has no ${!easyFames.length ? 'easy' : 'hard'} rows — promoted tiers may be off`,
    )
  const easyBound = easyFames.length ? Math.min(...easyFames) : Infinity
  const hardBound = hardFames.length ? Math.max(...hardFames) : -Infinity
  const tierFor = (f) =>
    f >= easyBound ? 'easy' : f <= hardBound ? 'hard' : 'medium'

  const moves = []
  for (const members of brandGroups(rows, cityTokens, cityId)) {
    if (members.length < 2) continue
    // Must be a GENUINE multi-location local chain — not a prefix collision of
    // different businesses (LTD vs LTD Edition Sushi) and not a national chain.
    const canonical = canonicalBase(members)
    const canonNorm = normalizeBusinessName(canonical, cityTokens)
    if (!isMultiLocation(members, canonNorm, osmCounts, cityId)) continue
    if (isNationalBrand(canonical, natTokens, fameNatIds, members)) continue
    // Only matters when some branches are benched: then the flagship might be a
    // benched one that should take an in-play slot. If every branch is already
    // in-play (Dick's Drive-In, or a loose-cap city), the flagship is already
    // playable — permuting would only churn ids for no benefit.
    const playN = members.filter(inPlay).length
    if (playN === 0 || playN === members.length) continue

    // locations (the movable bundles) + their review counts
    const locs = []
    for (const m of members) {
      const rc = await reviewCount(
        baseOf(m.name),
        m.lat,
        m.lng,
        city.name,
        cityTokens,
      )
      const bundle = {}
      for (const f of LOC_FIELDS) if (f in m) bundle[f] = m[f]
      locs.push({ bundle, rc })
    }
    // pair: highest-fame (in-play first) entry ↔ most-reviewed location
    const entryOrder = members
      .map((m, i) => ({ m, i }))
      .sort(
        (a, b) =>
          Number(inPlay(b.m)) - Number(inPlay(a.m)) ||
          (b.m.fameScore ?? 0) - (a.m.fameScore ?? 0) ||
          a.m.id.localeCompare(b.m.id),
      )
    const locOrder = [...locs].sort((a, b) => b.rc - a.rc)
    // Fame travels too: the brand's fame scores, highest first, are handed out in
    // flagship order — so the most-reviewed (in-play) branch always carries the
    // highest fame, never a benched sibling.
    const fames = members.map((m) => m.fameScore ?? 0).sort((a, b) => b - a)
    entryOrder.forEach(({ m }, rank) => {
      const before = m.name
      for (const f of LOC_FIELDS) delete m[f]
      Object.assign(m, locOrder[rank].bundle)
      m.fameScore = fames[rank]
      if (inPlay(m)) m.difficulty = tierFor(fames[rank])
      if (m.name !== before) {
        if (m.clue) m.clue = null // old clue referenced the old branch
        moves.push(
          `  ${m.id} (fame ${m.fameScore}, ${inPlay(m) ? 'in-play' : 'benched'}): ${before} -> ${m.name} [${locOrder[rank].rc} reviews]`,
        )
      }
    })
  }

  console.log(
    `${cityId}: ${moves.length} pins reassigned${dry ? ' (dry)' : ''}`,
  )
  for (const line of moves) console.log(line)
  if (!dry && moves.length) {
    const cfg = await prettier.resolveConfig(dsUrl.pathname)
    await writeFile(
      dsUrl,
      await prettier.format(JSON.stringify(ds, null, 2), {
        ...cfg,
        parser: 'json',
      }),
    )
  }
  return moves.length
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const only = args.find((a) => !a.startsWith('--'))
  const cities = JSON.parse(
    await readFile(new URL('../cities.json', import.meta.url), 'utf8'),
  )
  const ids = only ? [only] : cities.map((c) => c.id)
  let total = 0
  for (const id of ids) total += await processCity(id, cities, dry)
  console.log(`\nTotal pins reassigned: ${total}${dry ? ' (dry)' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
