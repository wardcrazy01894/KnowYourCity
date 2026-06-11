// @ts-check
/**
 * fetch-pois.mjs — builds a *candidate* locations file for manual review.
 *
 * Pipeline (see docs/DATA-SOURCING.md for the full rationale):
 *   1. Query Overpass for POIs in the St. Pete bbox matching a tag allowlist.
 *   2. Keep only "notable" rows: has name AND (wikipedia|wikidata tag OR tag is
 *      inherently notable e.g. tourism=museum/attraction, leisure=golf_course).
 *   3. Drop obvious chains/mundane via a name denylist (laundromat, Great Clips…).
 *   4. Normalise to the Location schema; emit data/candidates.json.
 *   5. A HUMAN then curates candidates.json → a per-city public/locations.<id>.json
 *      (fix names, write clues, delete junk). The script never writes
 *      locations.json directly — curation is deliberate.
 *
 * Run: `npm run fetch-pois`  (needs Node 18+ for global fetch; the app build/CI
 *   runs Node 22 — see .github/workflows)
 */

import { mkdir, writeFile } from 'node:fs/promises'

/** St. Pete bounding box [south, west, north, east] — matches the stpete bounds in cities.json. */
export const ST_PETE_BBOX = /** @type {const} */ ([
  27.62, -82.78, 27.87, -82.58,
])

/** Public Overpass instances, tried in order (with retries) if one is busy. */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * POST the query to each endpoint, retrying on transient busy/timeout errors.
 * Overpass annoyingly returns HTTP 200 with an HTML error body when overloaded,
 * so we also detect that and treat it as a retryable failure.
 */
async function fetchOverpass(query) {
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass requires a descriptive User-Agent or it returns 406/429.
            'User-Agent':
              'KnowYourCity/0.1 (https://github.com/wardcrazy01894/KnowYourCity)',
            Accept: 'application/json',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        const text = await res.text()
        if (!res.ok || !text.trimStart().startsWith('{')) {
          throw new Error(
            `busy/!ok (HTTP ${res.status}) from ${endpoint}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`,
          )
        }
        return JSON.parse(text)
      } catch (err) {
        lastErr = err
        console.warn(`  ${endpoint} attempt ${attempt} failed: ${err.message}`)
        await sleep(attempt * 3000)
      }
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed')
}

/**
 * Overpass QL. Pulls nodes+ways+relations for the allowlisted tags inside the
 * bbox; `out center` gives ways/relations a representative lat/lng.
 */
export function buildOverpassQuery([s, w, n, e] = ST_PETE_BBOX) {
  return `
[out:json][timeout:60];
(
  nwr["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium"](${s},${w},${n},${e});
  nwr["leisure"~"golf_course|park|stadium|marina|nature_reserve|garden|dog_park|recreation_ground"](${s},${w},${n},${e});
  nwr["historic"](${s},${w},${n},${e});
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikidata"](${s},${w},${n},${e});
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikipedia"](${s},${w},${n},${e});
  nwr["building"="stadium"](${s},${w},${n},${e});
);
out center tags;`.trim()
}

/** Names/patterns that should never appear regardless of tags. */
export const NAME_DENYLIST = [
  /laundromat/i,
  /great clips/i,
  /sport ?clips/i,
  /\bwash\b/i,
  /storage/i,
  /u-?haul/i,
]

/**
 * Tag classes that are inherently notable enough to keep even without a
 * wikipedia/wikidata link. Parks and other green spaces ARE kept (a city's
 * public parks/lakes are exactly the kind of place locals know) — the downstream
 * fame+status pass trims the genuinely-obscure tail (intramural fields, pocket
 * pollinator gardens, etc.), so we can afford to pull them inclusively here.
 */
function hasNotableTag(tags) {
  if (!tags) return false
  if (
    /^(attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium)$/.test(
      tags.tourism ?? '',
    )
  )
    return true
  if (
    /^(golf_course|stadium|marina|park|nature_reserve|garden|dog_park|recreation_ground)$/.test(
      tags.leisure ?? '',
    )
  )
    return true
  if (tags.historic) return true
  if (tags.building === 'stadium') return true
  if (/^(theatre|arts_centre)$/.test(tags.amenity ?? '')) return true
  return false
}

/** True if an Overpass element is notable enough to keep. */
export function isNotable(el) {
  const tags = el?.tags
  const name = tags?.name
  if (!name) return false
  if (NAME_DENYLIST.some((re) => re.test(name))) return false
  if (tags.wikipedia || tags.wikidata) return true
  return hasNotableTag(tags)
}

/** Infer our coarse category bucket from OSM tags. */
function inferCategory(tags) {
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (tags.leisure === 'golf_course') return 'golf_course'
  if (
    /^(park|nature_reserve|garden|dog_park|recreation_ground)$/.test(
      tags.leisure ?? '',
    )
  )
    return 'park'
  if (tags.leisure === 'stadium' || tags.building === 'stadium') return 'venue'
  if (tags.amenity === 'theatre' || tags.amenity === 'arts_centre')
    return 'venue'
  if (tags.amenity === 'cafe') return 'cafe'
  if (tags.amenity === 'bar' || tags.amenity === 'pub') return 'bar'
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.historic) return 'landmark'
  if (tags.tourism) return 'attraction'
  return 'other'
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Map an Overpass element → our Location candidate (id, name, lat, lng, …). */
export function toLocation(el) {
  const tags = el.tags
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat == null || lng == null) return null
  return {
    id: slugify(tags.name),
    name: tags.name,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    category: inferCategory(tags),
    clue: null, // human writes this during curation
    photoUrl: null,
    source: 'overpass',
    attribution: tags.wikidata
      ? 'OpenStreetMap ODbL; Wikidata CC0'
      : 'OpenStreetMap ODbL',
  }
}

/** Filter + map raw Overpass elements → notable landmark Location candidates. */
export function poiLocationsFromElements(elements) {
  const byId = new Map()
  for (const el of elements ?? []) {
    if (!isNotable(el)) continue
    const loc = toLocation(el)
    if (!loc || !loc.id) continue
    if (!byId.has(loc.id)) byId.set(loc.id, loc) // keep first occurrence
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function main() {
  const query = buildOverpassQuery()
  console.log('Querying Overpass…')
  const data = await fetchOverpass(query)
  const elements = data.elements ?? []
  console.log(`Overpass returned ${elements.length} raw elements.`)
  const candidates = poiLocationsFromElements(elements)

  await mkdir(new URL('../data/', import.meta.url), { recursive: true })
  await writeFile(
    new URL('../data/candidates.json', import.meta.url),
    JSON.stringify(
      {
        version: 1,
        city: 'St. Petersburg, FL',
        generatedFrom: query,
        locations: candidates,
      },
      null,
      2,
    ),
  )
  console.log(
    `Wrote ${candidates.length} candidates to data/candidates.json. Now curate (or use build-city) → public/locations.<id>.json`,
  )
}

// Only run when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
