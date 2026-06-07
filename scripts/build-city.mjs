// @ts-check
/**
 * build-city.mjs — generate a city's curated dataset → public/locations.<id>.json
 *
 * Combines notable landmarks (fetch-pois logic) with an inclusive food/drink
 * pull (fetch-food logic), dedupes, ranks food by "established-business" signal,
 * and caps to roughly the city's `target` from cities.json.
 *
 * Run: `npm run build-city -- <cityId>`   e.g. `npm run build-city -- seattle`
 */

import { readFile, writeFile } from 'node:fs/promises'
import { buildOverpassQuery, poiLocationsFromElements } from './fetch-pois.mjs'
import {
  buildFoodQuery,
  foodLocationsFromElements,
  fetchOverpass,
} from './fetch-food.mjs'

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

async function loadCity(id) {
  const all = JSON.parse(
    await readFile(new URL('../cities.json', import.meta.url), 'utf8'),
  )
  const city = all.find((c) => c.id === id)
  if (!city) {
    throw new Error(
      `Unknown city "${id}". Known: ${all.map((c) => c.id).join(', ')}`,
    )
  }
  return city
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Usage: node scripts/build-city.mjs <cityId>')
  const city = await loadCity(id)
  const [[s, w], [n, e]] = city.bounds
  const bbox = [s, w, n, e]
  console.log(`Building ${city.name} (target ~${city.target})…`)

  let landmarks = []
  let food = []
  try {
    const r = await fetchOverpass(buildOverpassQuery(bbox))
    landmarks = poiLocationsFromElements(r.elements)
  } catch (err) {
    console.warn('landmark query failed:', err.message)
  }
  try {
    const r = await fetchOverpass(buildFoodQuery(bbox))
    food = foodLocationsFromElements(r.elements)
  } catch (err) {
    console.warn('food query failed:', err.message)
  }
  console.log(`  landmarks=${landmarks.length} food=${food.length}`)

  // Combine with a BALANCED mix so every category (cafe/restaurant/bar/landmark)
  // is well represented — otherwise a landmark-heavy town fills the whole quota
  // with landmarks and the daily cafe/bar/restaurant rounds have nothing to pick.
  const usedIds = new Set()
  const usedNorms = new Set()
  const out = []
  const add = (loc) => {
    const nm = norm(loc.name)
    if (!loc.id || usedIds.has(loc.id) || usedNorms.has(nm)) return false
    if (out.length >= city.target) return false
    // Overpass `out center` can place a way/relation center just outside the
    // query box for boundary features — keep only points actually in-bounds.
    if (loc.lat < s || loc.lat > n || loc.lng < w || loc.lng > e) return false
    usedIds.add(loc.id)
    usedNorms.add(nm)
    const { _signal, ...clean } = loc
    void _signal
    out.push(clean)
    return true
  }
  const bySignal = (a, b) => (b._signal ?? 0) - (a._signal ?? 0)
  const cafes = food.filter((f) => f.category === 'cafe').sort(bySignal)
  const bars = food.filter((f) => f.category === 'bar').sort(bySignal)
  const rests = food.filter((f) => f.category === 'restaurant').sort(bySignal)
  const t = city.target

  // Rough composition: ~30% landmarks, ~18% cafés, ~22% bars, ~30% restaurants.
  const quota = {
    landmark: Math.min(landmarks.length, Math.round(t * 0.3)),
    cafe: Math.min(cafes.length, Math.round(t * 0.18)),
    bar: Math.min(bars.length, Math.round(t * 0.22)),
    rest: Math.min(rests.length, Math.round(t * 0.3)),
  }
  landmarks.slice(0, quota.landmark).forEach(add)
  cafes.slice(0, quota.cafe).forEach(add)
  bars.slice(0, quota.bar).forEach(add)
  rests.slice(0, quota.rest).forEach(add)
  // Top up to target from whatever's left, richest food first then landmarks.
  for (const f of [...cafes, ...bars, ...rests].sort(bySignal)) add(f)
  for (const l of landmarks) add(l)

  out.sort((a, b) => a.name.localeCompare(b.name))
  const byCat = {}
  for (const l of out) byCat[l.category] = (byCat[l.category] || 0) + 1

  await writeFile(
    new URL(`../public/locations.${id}.json`, import.meta.url),
    JSON.stringify(
      {
        version: 1,
        city: city.name,
        attribution:
          'Locations © OpenStreetMap contributors (ODbL) and Wikidata (CC0). Satellite imagery © Esri / Maxar.',
        locations: out,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `  wrote public/locations.${id}.json: ${out.length} locations`,
    JSON.stringify(byCat),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
