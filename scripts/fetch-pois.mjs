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
 *   5. A HUMAN then curates candidates.json → public/locations.json
 *      (fix names, write clues, delete junk). The script never writes
 *      locations.json directly — curation is deliberate.
 *
 * Run: `npm run fetch-pois`  (Node 18+, uses global fetch)
 *
 * This is a STUB: query + filter contracts are defined; bodies are TODO.
 */

import { writeFile } from 'node:fs/promises'

/** St. Pete bounding box [south, west, north, east]. Confirm with Alex. */
export const ST_PETE_BBOX = /** @type {const} */ ([27.62, -82.78, 27.86, -82.58])

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

/**
 * Overpass QL. Pulls nodes+ways+relations for the allowlisted tags inside the
 * bbox; `out center` gives ways/relations a representative lat/lng.
 */
export function buildOverpassQuery([s, w, n, e] = ST_PETE_BBOX) {
  return `
[out:json][timeout:60];
(
  nwr["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium"](${s},${w},${n},${e});
  nwr["leisure"~"golf_course|park|stadium|marina"](${s},${w},${n},${e});
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

/** True if an Overpass element is notable enough to keep. */
export function isNotable(_el) {
  // TODO: require tags.name; keep if wikipedia/wikidata present OR tag class is
  // inherently notable (museum/attraction/golf_course/historic/stadium);
  // reject if name matches NAME_DENYLIST.
  throw new Error('not implemented')
}

/** Map an Overpass element → our Location candidate (id, name, lat, lng, …). */
export function toLocation(_el) {
  // TODO: slugify name → id; read lat/lng (el.lat/el.lon or el.center);
  // infer category from tags; clue left empty for human; set source/attribution.
  throw new Error('not implemented')
}

async function main() {
  const query = buildOverpassQuery()
  // TODO: POST `data=${encodeURIComponent(query)}` to OVERPASS_ENDPOINT,
  // parse .elements, filter with isNotable, map with toLocation, de-dupe by id.
  const candidates = [] // <- filled by the steps above
  await writeFile(
    new URL('../data/candidates.json', import.meta.url),
    JSON.stringify({ version: 1, city: 'St. Petersburg, FL', generatedFrom: query, locations: candidates }, null, 2),
  )
  console.log(`Wrote ${candidates.length} candidates. Now curate → public/locations.json`)
}

// Only run when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
