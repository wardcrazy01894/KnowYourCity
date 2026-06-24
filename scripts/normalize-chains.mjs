// @ts-check
/**
 * normalize-chains.mjs — give every branch of a multi-location LOCAL chain a
 * consistent "<Brand> - <Neighborhood>" name so a player can tell which one a
 * pin is (issues #139/#140/#142). Brand-group aware, so it also normalizes the
 * pre-existing, inconsistently-disambiguated siblings (Kahwa Coffee North, Craft
 * Kafé DTSP, Serious Pie Ballard…) and covers EVERY food entry — in-play and
 * benched, all five cities — so the whole dataset is handled.
 *
 *   1. Group every food entry into brands: two entries are the same brand if
 *      their base names (suffix stripped, accent/`&`-folded) are equal or one is
 *      a token-prefix of the other (so "Serious Pie" ⊂ "Serious Pie Ballard").
 *      A small GROUP_OVERRIDE merges irregular siblings ("Kahwa South").
 *   2. A brand is MULTI-LOCATION if it has ≥2 dataset entries OR its name has ≥2
 *      branches in OSM (catches single-dataset-entry chains like Top Pot).
 *   3. National chains are excluded (data/national-chains.json + fame flags).
 *   4. Every branch gets "<canonical base> - <area>":
 *        · already "- X" formatted  → left as-is (no churn)
 *        · "(X)" parenthetical       → converted to "- X" (ABBREV-expanded)
 *        · bare / trailing-word      → labeled with a Google Places neighborhood
 *      Same-brand collisions fall back to a street/number suffix.
 *   5. Rewrites public/locations.<city>.json (only `name`; `id` kept) and writes
 *      the full per-brand listing to data/.chain-brands-report.md.
 *
 * Detection is free (cached Overpass pulls); only bare branches hit Places, and
 * results are cached, so re-runs are cheap. Usage:
 *   node scripts/normalize-chains.mjs            (apply, all cities)
 *   node scripts/normalize-chains.mjs --dry      (report only)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import prettier from 'prettier'
import {
  labelVenue,
  loadRgCache,
  saveRgCache,
  countOsmBranches,
} from './detect-chains.mjs'
import { normalizeBusinessName } from './apply-difficulty-lib.mjs'
import {
  FOOD,
  baseOf,
  brandGroups,
  canonicalBase,
  isMultiLocation,
  isNationalBrand,
} from './chain-grouping.mjs'

// Canonical base name for a brand, by any member id (overrides the auto-picked
// shortest base) — mainly to lock a consistent "&" spelling.
const CANONICAL_OVERRIDE = {
  'spud-fish-and-chips': 'Spud Fish & Chips',
  'spud-fish-chips': 'Spud Fish & Chips',
  'westmans-bagel-and-coffee': "Westman's Bagel & Coffee",
  'westmans-bagel-coffee': "Westman's Bagel & Coffee",
  'sharks-fish-and-chicken': "Shark's Fish & Chicken",
  'sharks-fish-chicken': "Shark's Fish & Chicken",
  'kahwa-coffee': 'Kahwa Coffee',
  'kahwa-coffee-north': 'Kahwa Coffee',
  'kahwa-south': 'Kahwa Coffee',
}

// Trailing parenthetical / abbreviation expansions for the "(X)"→"- X" rewrite.
const ABBREV = { DTSP: 'Downtown', 'DTSP)': 'Downtown' }

// Google's official neighborhood names → the colloquial name players use.
const LABEL_NORMALIZE = {
  'Downtown Seattle': 'Downtown',
  'Central Business District': 'Downtown',
  Adams: 'Ballard',
}

// Neighborhood labels Google returns that aren't real neighborhoods (planning
// districts, counties) — reject so we fall back to NOHOOD_LABEL / street.
const BAD_HOOD = /council|census|township|county|unincorporated/i

// Manual neighborhood for the handful of pins Google returns no `neighborhood`
// for (small/suburban markets) — from Nominatim reverse-geocoding.
const NOHOOD_LABEL = {
  'kahwa-coffee': 'Park Street',
  'carmelitas-mexican-restaurant': '62nd Ave N',
  'frays-donut-house': '49th St N',
  'mr-empanada': 'Edge District',
  'brothers-pizza': 'Highlands',
  'yallah-taco': 'Downtown',
  'home-run-inn-pizzeria': 'Bronzeville',
  'pepes-mexican-restaurant': 'Auburn Gresham',
  'sharks-fish-chicken': 'Ashburn',
  'the-goddess-and-grocer': 'Bucktown',
  'original-waffle-shop': 'North Atherton',
}

// Free Nominatim reverse-geocode (road only), for collision tie-breaks when two
// branches of a brand land in the same Places neighborhood. Cached on disk.
const NOMI_CACHE_URL = new URL('../data/.nominatim-cache.json', import.meta.url)
let nomiCache = null
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))
async function reverseRoad(lat, lng) {
  if (!nomiCache) {
    try {
      nomiCache = JSON.parse(readFileSync(NOMI_CACHE_URL, 'utf8'))
    } catch {
      nomiCache = {}
    }
  }
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (key in nomiCache) return nomiCache[key]
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
    {
      headers: { 'User-Agent': 'KnowYourCity-dev/1.0 (chain disambiguation)' },
    },
  )
  const road = ((await res.json()).address ?? {}).road ?? null
  nomiCache[key] = road
  await writeFile(NOMI_CACHE_URL, JSON.stringify(nomiCache, null, 2) + '\n')
  await sleepMs(1100)
  return road
}

/** True if a name already ends with a " - X" disambiguator. */
const hasDash = (name) => /\s-\s\S/.test(name)
/** Trailing "(X)" content, or null. */
const parenOf = (name) => {
  const m = name.match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : null
}

async function processCity(cityId, cities, dry, rgCache, report) {
  const city = cities.find((c) => c.id === cityId)
  const cityQuery = city?.name ?? cityId
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
  ).chains
  const fameNat = new Set()
  const fameUrl = new URL(`../data/fame-${cityId}.json`, import.meta.url)
  if (existsSync(fameUrl))
    for (const r of JSON.parse(readFileSync(fameUrl, 'utf8')))
      if (r.isNationalChain) fameNat.add(r.id)

  // OSM branch counts (from the cached Overpass pull written by detect-chains).
  const osmUrl = new URL(`../data/.osm-food.${cityId}.json`, import.meta.url)
  const osm = existsSync(osmUrl) ? JSON.parse(readFileSync(osmUrl, 'utf8')) : []
  const osmCounts = countOsmBranches(osm, cityTokens)

  const dsUrl = new URL(`../public/locations.${cityId}.json`, import.meta.url)
  const ds = JSON.parse(await readFile(dsUrl, 'utf8'))
  const rows = ds.locations.filter((l) => FOOD.has(l.category))

  // ---- per group: canonical base, multi-location test, rename targets ----
  const renames = [] // {id, old, newName}
  const listing = [] // {brand, members:[{name, inPlay}]}
  for (const members of brandGroups(rows, cityTokens, cityId)) {
    // canonical base: override wins, else the shared fewest-token base
    const canonical =
      members.map((m) => CANONICAL_OVERRIDE[m.id]).find(Boolean) ??
      canonicalBase(members)
    const canonNorm = normalizeBusinessName(canonical, cityTokens)
    if (!isMultiLocation(members, canonNorm, osmCounts, cityId)) continue
    if (isNationalBrand(canonical, nat, fameNat, members)) continue

    // resolve a label for every member, build new names
    const used = new Map() // newName -> member (collision guard within brand)
    const groupRenames = []
    for (const m of members) {
      let newName
      if (hasDash(m.name)) {
        newName = m.name // already in the convention — leave it
      } else {
        const paren = parenOf(m.name)
        let label
        if (paren) {
          label = ABBREV[paren] ?? paren
        } else {
          const rg = NOHOOD_LABEL[m.id]
            ? { hood: null }
            : await labelVenue(
                { name: baseOf(m.name), lat: m.lat, lng: m.lng, cityQuery },
                rgCache,
              )
          const hood = rg.hood && !BAD_HOOD.test(rg.hood) ? rg.hood : null
          label = hood || NOHOOD_LABEL[m.id] || null
          label = label ? (LABEL_NORMALIZE[label] ?? label) : null
        }
        newName = label ? `${canonical} - ${label}` : m.name
      }
      // collision within the brand (two branches in the same neighborhood) →
      // disambiguate with the street name (reverse-geocoded), else a counter.
      if (used.has(newName) && used.get(newName) !== m) {
        const road = await reverseRoad(m.lat, m.lng)
        newName =
          road && !newName.includes(road)
            ? `${newName} (${road})`
            : `${newName} #${used.size + 1}`
      }
      used.set(newName, m)
      groupRenames.push({
        id: m.id,
        old: m.name,
        newName,
        inPlay: m.inPlay !== false,
      })
    }
    listing.push({
      brand: canonical,
      osmCount: osmCounts.get(canonNorm)?.count ?? 0,
      members: groupRenames.map((r) => ({ name: r.newName, inPlay: r.inPlay })),
    })
    for (const r of groupRenames) if (r.newName !== r.old) renames.push(r)
  }
  await saveRgCache(rgCache)

  // ---- apply ----
  const byId = new Map(ds.locations.map((l) => [l.id, l]))
  for (const r of renames) byId.get(r.id).name = r.newName
  if (!dry && renames.length) {
    const cfg = await prettier.resolveConfig(dsUrl.pathname)
    const out = await prettier.format(JSON.stringify(ds, null, 2), {
      ...cfg,
      parser: 'json',
    })
    await writeFile(dsUrl, out)
  }

  // ---- report: every multi-location brand and all its branches ----
  report.push(
    `\n## ${cityId} — ${listing.length} multi-location brands, ${renames.length} names changed\n`,
  )
  for (const g of listing.sort((a, b) => a.brand.localeCompare(b.brand))) {
    report.push(
      `- **${g.brand}** (${g.members.length} in dataset, osm×${g.osmCount})`,
    )
    for (const m of g.members.sort((a, b) => a.name.localeCompare(b.name)))
      report.push(`  - ${m.name}${m.inPlay ? '' : ' _(benched)_'}`)
  }
  console.log(
    `${cityId}: ${listing.length} multi-location brands, ${renames.length} renamed${dry ? ' (dry)' : ''}`,
  )
  return { brands: listing.length, renamed: renames.length }
}

async function main() {
  const dry = process.argv.includes('--dry')
  const cities = JSON.parse(
    await readFile(new URL('../cities.json', import.meta.url), 'utf8'),
  )
  const only = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const rgCache = loadRgCache()
  const report = ['# Multi-location local chains — every branch, per city\n']
  let tB = 0
  let tR = 0
  const cityIds = only
    ? [only]
    : ['stpete', 'statecollege', 'annarbor', 'seattle', 'chicago']
  for (const cityId of cityIds) {
    const { brands, renamed } = await processCity(
      cityId,
      cities,
      dry,
      rgCache,
      report,
    )
    tB += brands
    tR += renamed
  }
  report.push(
    `\n**Total: ${tB} multi-location brands, ${tR} names changed.**\n`,
  )
  await writeFile(
    new URL('../data/.chain-brands-report.md', import.meta.url),
    report.join('\n') + '\n',
  )
  console.log(
    `\nTotal: ${tB} brands, ${tR} renamed. Report → data/.chain-brands-report.md`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
