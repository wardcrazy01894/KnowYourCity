// @ts-check
/**
 * add-chain-branches.mjs — for every multi-location LOCAL chain, add the OTHER
 * open in-bounds branches that the curated build kept out, so the dataset holds
 * ALL real locations (disambiguated). Branches are added BENCHED so a busy chain
 * outlet never bumps a curated landmark out of the fame-capped in-play set; the
 * already-selected flagship stays the one in play.
 *
 * Per city:
 *   1. Group food entries into brands (same logic as normalize-chains) and keep
 *      the multi-location ones (OSM≥2, or 2 same-category branches >300m apart).
 *   2. For each in-bounds OSM branch NOT already in the dataset (no existing
 *      entry of that brand within 120m):
 *        · verify a Place NAMED like the brand is OPERATIONAL at the pin — the
 *          match is name-matched, so a stale OSM pin that's now a DIFFERENT
 *          business (our old "Mr. Empanada" pin is now "Red Mesa") is skipped,
 *        · take ODbL coordinates from OSM (not Google),
 *        · neighborhood + review count from Places,
 *        · fame = a*log10(reviews)+b fit to THIS city's existing venues, so the
 *          branch is scored on the same absolute scale (recorded for a re-cap).
 *   3. Append a dataset row (inPlay:false, no difficulty) and a fame record. The
 *      in-play set is left untouched — EXCEPT a city whose cap isn't full (e.g.
 *      St. Pete) where a later apply-difficulty run flips everything in-play
 *      anyway (there's room, so still no displacement).
 *
 * Usage: node scripts/add-chain-branches.mjs <cityId> [--dry]
 *        node scripts/add-chain-branches.mjs --all [--dry]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import prettier from 'prettier'
import {
  slug,
  normalizeBusinessName,
  haversineMeters,
} from './apply-difficulty-lib.mjs'
import { countOsmBranches } from './detect-chains.mjs'
import {
  FOOD,
  tok,
  isPrefix,
  brandGroups,
  canonicalBase,
  isMultiLocation,
  isNationalBrand,
  nameMatches,
} from './chain-grouping.mjs'

const LABEL_NORMALIZE = {
  'Downtown Seattle': 'Downtown',
  'Central Business District': 'Downtown',
  Adams: 'Ballard',
}
const BAD_HOOD = /council|census|township|county|unincorporated/i

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VCACHE = new URL('../data/.chain-verify-cache.json', import.meta.url)
function loadVerify() {
  try {
    return JSON.parse(readFileSync(VCACHE, 'utf8'))
  } catch {
    return {}
  }
}

/** Verify a branch via Places: OPERATIONAL?, neighborhood, review count. Biased
 *  hard to a box around the OSM pin AND name-matched (the match must carry the
 *  brand's distinctive tokens) so a co-located / replaced business at a stale OSM
 *  pin isn't mistaken for the brand. Cached. */
async function verifyBranch(name, lat, lng, cityQuery, cityTokens, cache) {
  const ck = `${name}@${lat.toFixed(5)},${lng.toFixed(5)}`
  if (ck in cache) return cache[ck]
  const d = 0.004 // ~400m box
  const res = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.businessStatus,places.userRatingCount,places.addressComponents,places.location',
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
  const places = (await res.json()).places ?? []
  let best = null
  let bestD = Infinity
  for (const p of places) {
    if (!p.location) continue
    if (!nameMatches(p.displayName?.text ?? '', name, cityTokens)) continue
    const dm = haversineMeters(
      { lat, lng },
      { lat: p.location.latitude, lng: p.location.longitude },
    )
    if (dm < bestD) {
      bestD = dm
      best = p
    }
  }
  let rec = { ok: false }
  if (best && bestD <= 250) {
    const comps = {}
    for (const c of best.addressComponents ?? [])
      for (const t of c.types ?? []) comps[t] ??= c.shortText
    let hood =
      comps.neighborhood ??
      comps.sublocality_level_1 ??
      comps.sublocality ??
      null
    if (hood && BAD_HOOD.test(hood)) hood = null
    if (hood) hood = LABEL_NORMALIZE[hood] ?? hood
    rec = {
      ok: best.businessStatus === 'OPERATIONAL',
      status: best.businessStatus,
      hood,
      reviews: best.userRatingCount ?? 0,
      matchDist: Math.round(bestD),
    }
  }
  cache[ck] = rec
  writeFileSync(VCACHE, JSON.stringify(cache, null, 2) + '\n')
  await sleep(120)
  return rec
}

async function processCity(cityId, cities, dry, vcache) {
  const city = cities.find((c) => c.id === cityId)
  const [[s, w], [n, e]] = city.bounds
  const inBounds = (la, ln) => la >= s && la <= n && ln >= w && ln <= e
  const cityQuery = city.name
  const cityTokens = [
    ...new Set(
      [city.short, (city.name || '').split(',')[0]]
        .filter(Boolean)
        .map((x) => normalizeBusinessName(x)),
    ),
  ]
  const natList = JSON.parse(
    await readFile(
      new URL('../data/national-chains.json', import.meta.url),
      'utf8',
    ),
  ).chains

  const dsUrl = new URL(`../public/locations.${cityId}.json`, import.meta.url)
  const ds = JSON.parse(await readFile(dsUrl, 'utf8'))
  const fameUrl = new URL(`../data/fame-${cityId}.json`, import.meta.url)
  const fame = JSON.parse(readFileSync(fameUrl, 'utf8'))
  const fameById = new Map(fame.map((r) => [r.id, r]))
  const existingIds = new Set(ds.locations.map((l) => l.id))
  // Existing entries keep their ORIGINAL id (not a slug of their disambiguated
  // name), so collisions must be checked on the NAME too, not just the id.
  const usedNames = new Set(ds.locations.map((l) => l.name))

  // Calibrate fame = a*log10(reviews)+b from THIS city's existing venues (least
  // squares over operating, non-chain rows with reviews) so added branches are
  // scored on the same absolute scale, not relative to our (maybe minor) kept pin.
  const fit = (() => {
    const xs = []
    const ys = []
    for (const r of fame)
      if (
        r.status !== 'closed' &&
        !r.isNationalChain &&
        (r.reviewCount || 0) > 0
      ) {
        xs.push(Math.log10(r.reviewCount))
        ys.push(r.fameScore)
      }
    const nn = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / nn
    const my = ys.reduce((a, b) => a + b, 0) / nn
    let num = 0
    let den = 0
    for (let i = 0; i < nn; i++) {
      num += (xs[i] - mx) * (ys[i] - my)
      den += (xs[i] - mx) ** 2
    }
    const a = den ? num / den : 0
    return { a, b: my - a * mx }
  })()
  const fameFromReviews = (rc) =>
    Math.max(
      5,
      Math.min(90, Math.round(fit.a * Math.log10(Math.max(rc, 1)) + fit.b)),
    )

  const osm = existsSync(
    new URL(`../data/.osm-food.${cityId}.json`, import.meta.url),
  )
    ? JSON.parse(
        readFileSync(
          new URL(`../data/.osm-food.${cityId}.json`, import.meta.url),
          'utf8',
        ),
      )
    : []
  const osmCounts = countOsmBranches(osm, cityTokens)

  const fameNatIds = new Set(
    fame.filter((r) => r.isNationalChain).map((r) => r.id),
  )
  const foodRows = ds.locations.filter((l) => FOOD.has(l.category))
  const groups = brandGroups(foodRows, cityTokens, cityId)

  const addedRows = []
  const addedFame = []
  const report = []

  for (const members of groups) {
    const canonical = canonicalBase(members)
    const canonNorm = normalizeBusinessName(canonical, cityTokens)
    if (!isMultiLocation(members, canonNorm, osmCounts, cityId)) continue
    if (isNationalBrand(canonical, natList, fameNatIds, members)) continue

    // anchor fame = the highest-fame existing member with a fame record
    let anchor = null
    for (const m of members) {
      const fr = fameById.get(m.id)
      if (fr && (anchor == null || fr.fameScore > anchor.fameScore)) anchor = fr
    }
    if (!anchor) continue
    const category = members[0].category

    // OSM pins for this brand (canonical name + prefixed variants), in-bounds
    const pins = []
    for (const [k, info] of osmCounts) {
      if (
        k === canonNorm ||
        isPrefix(tok(canonNorm), tok(k)) ||
        isPrefix(tok(k), tok(canonNorm))
      )
        for (const p of info.pins)
          if (
            inBounds(p.lat, p.lng) &&
            !pins.some((q) => haversineMeters(q, p) <= 80)
          )
            pins.push(p)
    }
    for (const p of pins) {
      const near = members.some((m) => haversineMeters(m, p) <= 120)
      if (near) continue // already represented
      // verify open
      const v = await verifyBranch(
        canonical,
        p.lat,
        p.lng,
        cityQuery,
        cityTokens,
        vcache,
      )
      if (!v.ok) {
        report.push(
          `  skip ${canonical} @${p.lat.toFixed(4)},${p.lng.toFixed(4)} — ${v.status ?? 'no match'}`,
        )
        continue
      }
      const hood = v.hood || p.street || null
      if (!hood) {
        report.push(`  skip ${canonical} — no neighborhood/street`)
        continue
      }
      // fame from this branch's review count on the city's absolute scale
      const fameScore = fameFromReviews(v.reviews || 0)
      let name = `${canonical} - ${hood}`
      let id = slug(name)
      // Collision (same brand, same neighborhood as an existing/added entry) →
      // disambiguate with the OSM street; if that still collides or there's no
      // street, skip rather than emit a duplicate or an ugly numeric suffix.
      if (usedNames.has(name) || existingIds.has(id)) {
        if (!p.street) {
          report.push(`  skip ${name} — duplicate, no street to disambiguate`)
          continue
        }
        name = `${canonical} - ${hood} (${p.street})`
        id = slug(name)
      }
      if (usedNames.has(name) || existingIds.has(id)) {
        report.push(`  skip ${name} — duplicate`)
        continue
      }
      existingIds.add(id)
      usedNames.add(name)
      // member used for dedup against further pins
      members.push({ id, name, lat: p.lat, lng: p.lng, category })
      // Added BENCHED by default (inPlay:false, no difficulty) so a non-flagship
      // chain branch never displaces a curated landmark from the fame-capped
      // in-play set — review popularity must not outrank a monument. The fame
      // score is recorded so a later re-cap can promote it if desired. (In a
      // city whose cap isn't full, e.g. St. Pete, apply-difficulty re-run flips
      // everything in-play anyway — there's room, so no displacement.)
      addedRows.push({
        id,
        name,
        lat: p.lat,
        lng: p.lng,
        category,
        inPlay: false,
        fameScore,
        clue: null,
        photoUrl: null,
        source: 'overpass',
        attribution: 'OpenStreetMap ODbL',
        lastVerified: '2026-06-24',
      })
      addedFame.push({
        id,
        status: 'operating',
        currentName: '',
        fameScore,
        reviewCount: v.reviews || 0,
        hasWikipedia: false,
        isNationalChain: false,
        statusNote: 'chain branch added from OSM, Places-verified open',
      })
      report.push(`  + ${name}  (fame ${fameScore}, ${v.reviews} reviews)`)
    }
  }

  console.log(`${cityId}: +${addedRows.length} branches added`)
  for (const line of report) console.log(line)

  if (!dry && addedRows.length) {
    ds.locations.push(...addedRows)
    const cfg = await prettier.resolveConfig(dsUrl.pathname)
    await writeFile(
      dsUrl,
      await prettier.format(JSON.stringify(ds, null, 2), {
        ...cfg,
        parser: 'json',
      }),
    )
    fame.push(...addedFame)
    writeFileSync(fameUrl, JSON.stringify(fame, null, 2) + '\n')
  }
  return addedRows.length
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const all = args.includes('--all')
  const only = args.find((a) => !a.startsWith('--'))
  const cities = JSON.parse(
    await readFile(new URL('../cities.json', import.meta.url), 'utf8'),
  )
  const ids = all ? cities.map((c) => c.id) : [only]
  const vcache = loadVerify()
  let total = 0
  for (const id of ids) total += await processCity(id, cities, dry, vcache)
  console.log(`\nTotal added: ${total}${dry ? ' (dry)' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
