// @ts-check
/**
 * nearby-sweep.mjs — after adding a location, check what else sits on that
 * block that the dataset is missing.
 *
 * Born from issues #50/#51: the two requested venues turned out to share a
 * block (and an owner) with two more spots the dataset lacked. The lesson,
 * mechanized: every manual add should sweep its surroundings.
 *
 * Queries Overpass for NAMED food/drink/POI features within a radius of a
 * point and splits them into present-in-dataset vs MISSING, using the same
 * normalized-name + proximity rule the build pipeline uses for dupes. (OSM
 * can't surface places it doesn't have — pair this with a quick web check of
 * the block / the owner's other venues; see the add-location skill.)
 *
 * Usage:
 *   node scripts/nearby-sweep.mjs <cityId> <lat,lng> [radiusMeters]
 *   node scripts/nearby-sweep.mjs <cityId> <locationId> [radiusMeters]
 */

import { readFile } from 'node:fs/promises'
import { fetchOverpass } from './fetch-food.mjs'
import {
  normalizeBusinessName,
  haversineMeters,
  DEFAULT_DEDUPE_METERS,
} from './apply-difficulty-lib.mjs'

export const DEFAULT_SWEEP_RADIUS_METERS = 160

/** Extract named, categorized POIs from Overpass elements (nodes or
 *  ways/relations with `out center`). */
export function poisFromElements(elements) {
  const out = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    const kind = tags.amenity ?? tags.tourism ?? tags.leisure ?? tags.shop
    if (!tags.name || !kind) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    out.push({ name: tags.name, lat, lng, kind })
  }
  return out
}

/**
 * Split OSM POIs near `center` into ones the dataset already has (same
 * normalized name within DEFAULT_DEDUPE_METERS — the pipeline's dupe rule)
 * and ones it's MISSING. Same-name POIs are de-duped keeping the one nearest
 * the center. Pure — no IO — so it's unit-testable.
 */
export function findMissingNearby({
  dataset,
  osmPois,
  center,
  radiusMeters = DEFAULT_SWEEP_RADIUS_METERS,
  cityTokens = [],
}) {
  const norm = (name) => normalizeBusinessName(name, cityTokens)
  const within = osmPois
    .map((p) => ({ ...p, distanceMeters: haversineMeters(center, p) }))
    .filter((p) => p.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const seen = new Set()
  const present = []
  const missing = []
  for (const poi of within) {
    const nm = norm(poi.name)
    if (seen.has(nm)) continue
    seen.add(nm)
    const match = dataset.find(
      (loc) =>
        norm(loc.name) === nm &&
        haversineMeters(loc, poi) <= DEFAULT_DEDUPE_METERS,
    )
    if (match) present.push({ ...poi, matchedTo: match.id })
    else missing.push(poi)
  }
  return { present, missing }
}

function buildSweepQuery({ lat, lng }, radiusMeters) {
  const around = `(around:${radiusMeters},${lat},${lng})`
  return `[out:json][timeout:30];
(
  nwr["name"]["amenity"~"^(bar|pub|restaurant|cafe|biergarten|nightclub|food_court|ice_cream|theatre|cinema|arts_centre)$"]${around};
  nwr["name"]["tourism"~"^(museum|attraction|gallery|artwork|viewpoint)$"]${around};
  nwr["name"]["leisure"~"^(park|garden|stadium|pitch|marina)$"]${around};
);
out center tags;`
}

async function main() {
  const [cityId, where, radiusArg] = process.argv.slice(2)
  if (!cityId || !where)
    throw new Error(
      'Usage: node scripts/nearby-sweep.mjs <cityId> <lat,lng | locationId> [radiusMeters]',
    )
  const radius = radiusArg ? Number(radiusArg) : DEFAULT_SWEEP_RADIUS_METERS
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

  let center
  if (/^-?[\d.]+,-?[\d.]+$/.test(where)) {
    const [lat, lng] = where.split(',').map(Number)
    center = { lat, lng }
  } else {
    const loc = ds.locations.find((l) => l.id === where)
    if (!loc) throw new Error(`No location "${where}" in ${cityId} dataset`)
    center = { lat: loc.lat, lng: loc.lng }
  }

  const r = await fetchOverpass(buildSweepQuery(center, radius))
  const osmPois = poisFromElements(r.elements)
  const { present, missing } = findMissingNearby({
    dataset: ds.locations,
    osmPois,
    center,
    radiusMeters: radius,
    cityTokens,
  })

  console.log(
    `Sweep ${cityId} @ ${center.lat},${center.lng} (r=${radius}m): ` +
      `${present.length} already in dataset, ${missing.length} missing`,
  )
  for (const p of present)
    console.log(
      `  ✓ ${p.name} (${Math.round(p.distanceMeters)}m → ${p.matchedTo})`,
    )
  for (const m of missing)
    console.log(
      `  ✗ MISSING: ${m.name} [${m.kind}] (${Math.round(m.distanceMeters)}m @ ${m.lat},${m.lng})`,
    )
  if (!missing.length)
    console.log('  (no OSM gaps — still web-check the block)')
}

// Only run when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
