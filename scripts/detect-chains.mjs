// @ts-check
/**
 * detect-chains.mjs — find LOCAL multi-location chains in a city's dataset that
 * need a neighborhood appended to disambiguate them (issues #139/#140/#142).
 *
 * A player who sees a pin labeled just "Top Pot Doughnuts" can't know WHICH of
 * the chain's branches it is. This flags every in-scope dataset entry whose
 * business is a local chain with 2+ branches, so its name can be disambiguated
 * (e.g. "Top Pot Doughnuts - Capitol Hill").
 *
 * Detection is FREE (no Places spend):
 *   - Signal A (OSM): query Overpass for all named food POIs in the city bbox;
 *     a normalized name with 2+ distinct branches (>DUP_METERS apart) is a chain.
 *     Catches single-dataset-entry chains (Top Pot, Daniel's Broiler, Ivar's Fish Bar).
 *   - Signal B (dataset): entries sharing a normalized full name (exact dup) OR a
 *     2-token brand prefix (Kahwa Coffee / Kahwa South). Catches the already-in-
 *     dataset multi-entries with inconsistent names.
 * NATIONAL chains are excluded via data/national-chains.json + isNationalChain
 * fame flags — only LOCAL chains stay.
 *
 * Neighborhood labels come from Google Places (cached to
 * data/.chain-label-cache.json), hard-restricted to a box around our pin so we
 * get the branch that's actually here — free Nominatim reverse-geocoding proved
 * too inaccurate (it tags Capitol Hill pins as "Madison Valley"). Only the
 * confirmed rename targets are labeled, so the Places spend is small.
 *
 * Usage:
 *   node scripts/detect-chains.mjs <cityId> [--inplay-only]
 *   node scripts/detect-chains.mjs --all          (every city, default scope)
 *
 * Writes data/.chain-candidates.<city>.json and prints a review table. It does
 * NOT edit the dataset — review the table, then apply renames deliberately.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fetchOverpass } from './fetch-food.mjs'
import {
  normalizeBusinessName,
  haversineMeters,
  matchNationalChain,
} from './apply-difficulty-lib.mjs'

// Two OSM pins of the same name within this distance are the same physical
// place double-tagged (node + building), not two branches.
const SAME_PLACE_METERS = 80

const FOOD_CATS = new Set(['cafe', 'bar', 'restaurant'])

/** Significant brand prefix: first 2 tokens of the normalized name, with a
 *  leading "the"/"original" dropped so "The Waffle Shop" ≈ "Waffle Shop". */
export function brandPrefix(normName) {
  const toks = normName.split(' ').filter(Boolean)
  while (toks.length > 2 && (toks[0] === 'the' || toks[0] === 'original'))
    toks.shift()
  return toks.slice(0, 2).join(' ')
}

/** Count distinct OSM branches per normalized name (collapsing same-place
 *  double-tags within SAME_PLACE_METERS). Returns Map<normName, {count, pins}>. */
export function countOsmBranches(osmPois, cityTokens) {
  const byName = new Map()
  for (const p of osmPois) {
    const nm = normalizeBusinessName(p.name, cityTokens)
    if (!byName.has(nm)) byName.set(nm, [])
    byName.get(nm).push(p)
  }
  const out = new Map()
  for (const [nm, pins] of byName) {
    const distinct = []
    for (const p of pins) {
      if (!distinct.some((d) => haversineMeters(d, p) <= SAME_PLACE_METERS))
        distinct.push(p)
    }
    out.set(nm, { count: distinct.length, pins: distinct })
  }
  return out
}

function buildCityFoodQuery([s, w, n, e]) {
  const box = `(${s},${w},${n},${e})`
  return `[out:json][timeout:90];
(
  nwr["name"]["amenity"~"^(bar|pub|restaurant|cafe|biergarten|fast_food|ice_cream|food_court)$"]${box};
  nwr["name"]["shop"~"^(bakery|coffee|pastry|confectionery|deli)$"]${box};
);
out center tags;`
}

function osmPoisFromElements(elements) {
  const out = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    if (!tags.name) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    out.push({ name: tags.name, lat, lng, street: tags['addr:street'] ?? '' })
  }
  return out
}

// ---- neighborhood labeling via Google Places (New), cached on disk ----
// Free OSM reverse-geocoding (Nominatim) proved too inaccurate for the label
// (it tags Capitol Hill pins as "Madison Valley"); Places gives the correct
// neighborhood AND often an official branch name ("Daniel's Broiler Downtown").
// We only call it for the confirmed chain rename targets, so the spend is small.
const RG_CACHE_URL = new URL('../data/.chain-label-cache.json', import.meta.url)
export function loadRgCache() {
  try {
    return JSON.parse(readFileSync(RG_CACHE_URL, 'utf8'))
  } catch {
    return {}
  }
}
export async function saveRgCache(cache) {
  await writeFile(RG_CACHE_URL, JSON.stringify(cache, null, 2) + '\n')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function placesKey() {
  // read .env.local lazily (same approach as places-freshness.mjs)
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = env.match(/^GOOGLE_MAPS_KEY=(.+)$/m)
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''
  } catch {
    return ''
  }
}
const KEY = placesKey()

/**
 * Label a venue with its neighborhood + Google's branch name. Biases the text
 * search to our pin so the nearest matching branch is returned. Returns
 * { hood, branchName, matchDistM } — matchDistM flags a possible wrong-branch
 * match (>250m) for human review.
 */
export async function labelVenue({ name, lat, lng, cityQuery }, cache) {
  const cacheKey = `${name}@${lat.toFixed(5)},${lng.toFixed(5)}`
  if (cacheKey in cache) return cache[cacheKey]
  // HARD-restrict to a ~600m box around OUR pin so we get the branch that's
  // actually here, not the chain's most-prominent (often far) flagship. Then
  // pick the candidate NEAREST our pin among the returned matches.
  const d = 0.006 // ~600m in latitude; close enough in lng at these latitudes
  const body = {
    textQuery: `${name}, ${cityQuery}`,
    locationRestriction: {
      rectangle: {
        low: { latitude: lat - d, longitude: lng - d },
        high: { latitude: lat + d, longitude: lng + d },
      },
    },
    maxResultCount: 10,
  }
  const res = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.addressComponents,places.location',
      },
      body: JSON.stringify(body),
    },
  )
  const places = (await res.json()).places ?? []
  // nearest candidate to our pin
  let best = null
  let bestD = Infinity
  for (const p of places) {
    if (!p.location) continue
    const dm = haversineMeters(
      { lat, lng },
      { lat: p.location.latitude, lng: p.location.longitude },
    )
    if (dm < bestD) {
      bestD = dm
      best = p
    }
  }
  let rec = { hood: null, branchName: null, matchDistM: null }
  if (best) {
    const comps = {}
    for (const c of best.addressComponents ?? [])
      for (const t of c.types ?? []) comps[t] ??= c.shortText
    rec.hood =
      comps.neighborhood ??
      comps.sublocality_level_1 ??
      comps.sublocality ??
      null
    rec.branchName = best.displayName?.text ?? null
    rec.matchDistM = Math.round(bestD)
  }
  cache[cacheKey] = rec
  await sleep(120)
  return rec
}

async function detectCity(cityId, inplayOnly, rgCache) {
  const ds = JSON.parse(
    await readFile(
      new URL(`../public/locations.${cityId}.json`, import.meta.url),
      'utf8',
    ),
  )
  const cities = JSON.parse(
    await readFile(new URL('../cities.json', import.meta.url), 'utf8'),
  )
  const city = cities.find((c) => c.id === cityId)
  const cityTokens = [
    ...new Set(
      [city?.short, (city?.name || '').split(',')[0]]
        .filter(Boolean)
        .map((s) => normalizeBusinessName(s)),
    ),
  ]
  const nat = JSON.parse(
    await readFile(
      new URL('../data/national-chains.json', import.meta.url),
      'utf8',
    ),
  )
  const natChains = nat.chains ?? []
  // isNationalChain flags from the fame cache (by id)
  const fameNat = new Set()
  const fameUrl = new URL(`../data/fame-${cityId}.json`, import.meta.url)
  if (existsSync(fameUrl)) {
    for (const r of JSON.parse(readFileSync(fameUrl, 'utf8')))
      if (r.isNationalChain) fameNat.add(r.id)
  }

  // ---- Signal A: OSM branch counts (cache the Overpass pull so re-runs that
  //      only tweak labeling don't re-hammer Overpass and trip its rate limit) ----
  const osmCacheUrl = new URL(
    `../data/.osm-food.${cityId}.json`,
    import.meta.url,
  )
  let osm
  if (existsSync(osmCacheUrl)) {
    osm = JSON.parse(readFileSync(osmCacheUrl, 'utf8'))
  } else {
    const r = await fetchOverpass(buildCityFoodQuery(city.bounds.flat()))
    osm = osmPoisFromElements(r.elements)
    await writeFile(osmCacheUrl, JSON.stringify(osm) + '\n')
  }
  const osmCounts = countOsmBranches(osm, cityTokens)

  // ---- in-scope dataset rows ----
  const rows = ds.locations.filter((l) => {
    if (inplayOnly && l.inPlay === false) return false
    return FOOD_CATS.has(l.category)
  })

  // ---- Signal B: dataset name / brand clusters ----
  const byName = new Map()
  const byBrand = new Map()
  for (const l of rows) {
    const nm = normalizeBusinessName(l.name, cityTokens)
    ;(byName.get(nm) ?? byName.set(nm, []).get(nm)).push(l)
    const bp = brandPrefix(nm)
    ;(byBrand.get(bp) ?? byBrand.set(bp, []).get(bp)).push(l)
  }

  // A name that already carries a disambiguator (the "Brand - Area" convention,
  // a parenthetical, or a trailing direction) is already handled — don't re-suffix.
  const alreadyDisambig = (name) =>
    /\s-\s|\(|\b(north|south|east|west|downtown|uptown)\b/i.test(name)

  const candidates = []
  for (const l of rows) {
    const nm = normalizeBusinessName(l.name, cityTokens)
    const osmInfo = osmCounts.get(nm)
    const osmBranches = osmInfo?.count ?? 0
    const dsExact = byName.get(nm)?.length ?? 1
    const brandSibs = byBrand.get(brandPrefix(nm)) ?? []
    const dsBrand = new Set(brandSibs.map((x) => x.id)).size

    // RELIABLE chain signal only: same full name 2+ in OSM, or an exact dataset
    // duplicate. Brand-prefix clusters (dsBrand) are too noisy to auto-trigger
    // (shared street/region words) — emitted as advisory `dsBrandSiblings`.
    const confirmedChain = osmBranches >= 2 || dsExact >= 2
    if (!confirmedChain && dsBrand < 2) continue

    const natTok = matchNationalChain(l.name, natChains)
    const isNational = !!natTok || fameNat.has(l.id)

    candidates.push({
      id: l.id,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      category: l.category,
      inPlay: l.inPlay !== false,
      osmBranches,
      dsExactDupes: dsExact,
      confirmedChain,
      alreadyDisambiguated: alreadyDisambig(l.name),
      dsBrandSiblings: brandSibs
        .filter((x) => x.id !== l.id)
        .map((x) => x.name),
      national: isNational ? natTok || 'fame-flagged' : null,
    })
  }

  // ---- label the rename targets (confirmed local chains not already
  //      disambiguated) with a neighborhood via Google Places ----
  const cityQuery = city?.name ?? cityId
  const local = candidates.filter(
    (c) => !c.national && c.confirmedChain && !c.alreadyDisambiguated,
  )
  for (const c of local) {
    const rg = await labelVenue(
      { name: c.name, lat: c.lat, lng: c.lng, cityQuery },
      rgCache,
    )
    c.neighborhood = rg.hood
    c.branchName = rg.branchName
    c.matchDistM = rg.matchDistM
  }

  return { cityId, candidates, local }
}

function printTable(cityId, candidates) {
  const nat = candidates.filter((c) => c.national)
  const propose = candidates.filter(
    (c) => !c.national && c.confirmedChain && !c.alreadyDisambiguated,
  )
  const already = candidates.filter(
    (c) => !c.national && c.confirmedChain && c.alreadyDisambiguated,
  )
  const clusters = candidates.filter((c) => !c.national && !c.confirmedChain)
  console.log(`\n=== ${cityId} ===`)
  console.log(
    `  PROPOSE rename (confirmed local chain, not yet disambiguated):`,
  )
  for (const c of propose) {
    const label = c.neighborhood || '??'
    const warn =
      c.matchDistM != null && c.matchDistM > 250
        ? `  ⚠ match ${c.matchDistM}m away`
        : ''
    const g =
      c.branchName && c.branchName !== c.name
        ? `  [google: ${c.branchName}]`
        : ''
    console.log(
      `    ${c.name}  (osm×${c.osmBranches}, ds×${c.dsExactDupes})  → "${c.name} - ${label}"${g}${warn}`,
    )
  }
  if (already.length) {
    console.log(`  already disambiguated (skip): ${already.length}`)
    for (const c of already) console.log(`    · ${c.name}`)
  }
  if (clusters.length) {
    console.log(
      `  brand clusters — REVIEW by hand (shared prefix, may be a chain or just a shared street/word):`,
    )
    for (const c of clusters)
      console.log(
        `    ? ${c.name}  [siblings: ${c.dsBrandSiblings.join(', ')}]`,
      )
  }
  if (nat.length) {
    console.log(`  excluded (national chain): ${nat.length}`)
    for (const c of nat) console.log(`    × ${c.name}  (${c.national})`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const inplayOnly = args.includes('--inplay-only')
  const all = args.includes('--all')
  const SCOPE = {
    // agreed scope: full for these, in-play only for chicago
    stpete: false,
    statecollege: false,
    annarbor: false,
    seattle: false,
    chicago: true,
  }
  const cityArg = args.find((a) => !a.startsWith('--'))
  const cityIds = all
    ? Object.keys(SCOPE)
    : cityArg
      ? [cityArg]
      : (() => {
          throw new Error('Usage: detect-chains.mjs <cityId> | --all')
        })()

  const rgCache = loadRgCache()
  const everything = {}
  for (const cityId of cityIds) {
    const ipOnly = inplayOnly || (all && SCOPE[cityId])
    const { candidates } = await detectCity(cityId, ipOnly, rgCache)
    everything[cityId] = candidates
    printTable(cityId, candidates)
    await writeFile(
      new URL(`../data/.chain-candidates.${cityId}.json`, import.meta.url),
      JSON.stringify(candidates, null, 2) + '\n',
    )
    await writeFile(RG_CACHE_URL, JSON.stringify(rgCache, null, 2) + '\n')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
