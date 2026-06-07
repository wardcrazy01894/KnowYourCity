// @ts-check
/**
 * fetch-food.mjs — inclusive food/drink candidate pull for KnowYourLocals.
 *
 * Unlike fetch-pois.mjs (notability-gated landmarks), this pulls *every*
 * established, non-chain restaurant / bar / café / brewery in the bounding box
 * from OpenStreetMap, so the dataset reflects "places people would know" broadly
 * (Alex's call: include anything in the box that's a real local spot).
 *
 * Filters:
 *   - must have a name
 *   - drop genuine NATIONAL chains (McDonald's, Starbucks, …). Local mini-chains
 *     people know (Hawkers, 3 Daughters, Datz, Mazzaro's…) are kept.
 *   - drop known-closed spots (Sea Salt, Red Mesa, …)
 *   - require an "established business" signal (website / opening_hours / cuisine
 *     / phone / wikidata) for RESTAURANTS & CAFÉS only — this filters out bare,
 *     half-mapped eateries. BARS/PUBS/BREWERIES are kept even without it (many
 *     real dive bars carry almost no tags, and we want broad bar coverage).
 *   - dedupe by name (keep first occurrence)
 *
 * NOTE on "≥100 Yelp reviews": Yelp/Google review counts can't be stored in the
 * repo without violating their API terms (same reason we don't use Google for
 * POIs). OSM data is ODbL (storable), so we proxy popularity with the
 * established-business signal above. A precise review threshold would need a
 * paid Yelp/Google integration (see BACKLOG).
 *
 * Output: data/food-candidates.json (gitignored). Merge into
 * public/locations.<id>.json — see docs/DATA-SOURCING.md. Run: `npm run fetch-food`.
 */

import { mkdir, writeFile } from 'node:fs/promises'

/** St. Pete bbox [south, west, north, east] — matches stpete bounds in cities.json. */
export const FOOD_BBOX = /** @type {const} */ ([27.62, -82.78, 27.87, -82.58])

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function buildFoodQuery([s, w, n, e] = FOOD_BBOX) {
  return `
[out:json][timeout:120];
(
  nwr["amenity"~"restaurant|bar|cafe|pub|biergarten|fast_food|food_court"](${s},${w},${n},${e});
  nwr["craft"="brewery"](${s},${w},${n},${e});
);
out center tags;`.trim()
}

/** Genuine national chains to exclude. Local mini-chains are intentionally kept. */
export const NATIONAL_CHAIN =
  /mcdonald|burger king|wendy'?s|taco bell|starbucks|dunkin|chipotle|subway|panera|chick-?fil|popeye|\bkfc\b|wingstop|jersey mike|firehouse subs|jimmy john|\bpdq\b|first watch|outback|carrabba|ford'?s garage|voodoo brewing|domino'?s|papa john|pizza hut|little caesar|marco'?s pizza|7-?eleven|circle k|wawa|sonic drive|arby'?s|culver'?s|checkers|applebee|chili'?s grill|\bihop\b|denny'?s|waffle house|panda express|five guys|smoothie king|tropical smoothie|jamba|baskin|cold stone|dairy queen|qdoba|moe'?s southwest|einstein|krispy kreme|zaxby|raising cane|whataburger|in-?n-?out|jeremiah'?s|tijuana flats|pincho|pollo tropical|metro diner|keke'?s|cody'?s|cracker barrel|olive garden|red lobster|longhorn|texas roadhouse|bonefish/i

/** Known-closed spots (OSM can lag). Extend as needed. */
export const CLOSED = /sea salt|red mesa|locale market|farmtable/i

function categoryFor(amenity) {
  if (amenity === 'cafe') return 'cafe'
  if (['bar', 'pub', 'biergarten', 'brewery'].includes(amenity)) return 'bar'
  return 'restaurant' // restaurant, fast_food, food_court
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

export async function fetchOverpass(query) {
  let lastErr
  for (const ep of OVERPASS_ENDPOINTS)
    for (let a = 1; a <= 3; a++)
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'KnowYourLocals/0.1 (https://github.com/wardcrazy01894/KnowYourLocals)',
            Accept: 'application/json',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        const text = await res.text()
        if (!res.ok || !text.trimStart().startsWith('{'))
          throw new Error(`busy (HTTP ${res.status})`)
        return JSON.parse(text)
      } catch (err) {
        lastErr = err
        console.warn(`  ${ep} attempt ${a} failed: ${err.message}`)
        await sleep(a * 3000)
      }
  throw lastErr ?? new Error('All Overpass endpoints failed')
}

/** True if the element has an "established business" signal. */
export function hasEstablishedSignal(tags) {
  return Boolean(
    tags.website ||
    tags['contact:website'] ||
    tags.opening_hours ||
    tags.cuisine ||
    tags.phone ||
    tags['contact:phone'] ||
    tags.wikidata,
  )
}

/** Count of "established business" signals on an element (richness ranking). */
export function signalScore(tags) {
  return [
    tags.website || tags['contact:website'],
    tags.opening_hours,
    tags.cuisine,
    tags.phone || tags['contact:phone'],
    tags.wikidata,
  ].filter(Boolean).length
}

/** Filter + map raw Overpass elements → food/drink Location candidates. */
export function foodLocationsFromElements(elements) {
  const seen = new Set()
  const out = []
  for (const el of elements ?? []) {
    const t = el.tags || {}
    if (!t.name) continue
    if (NATIONAL_CHAIN.test(t.name) || CLOSED.test(t.name)) continue
    const category = categoryFor(t.amenity || t.craft || '')
    // Bars get a free pass; restaurants/cafés must look established.
    if (category !== 'bar' && !hasEstablishedSignal(t)) continue
    if (seen.has(t.name)) continue
    seen.add(t.name)
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    out.push({
      id: slugify(t.name),
      name: t.name,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      category,
      clue: null,
      photoUrl: null,
      source: 'overpass',
      attribution: 'OpenStreetMap ODbL',
      _signal: signalScore(t),
    })
  }
  return out
}

async function main() {
  console.log('Querying Overpass for food/drink…')
  const data = await fetchOverpass(buildFoodQuery())
  const out = foodLocationsFromElements(data.elements).map(
    // eslint-disable-next-line no-unused-vars
    ({ _signal, ...l }) => l,
  )
  out.sort((a, b) => a.name.localeCompare(b.name))
  await mkdir(new URL('../data/', import.meta.url), { recursive: true })
  await writeFile(
    new URL('../data/food-candidates.json', import.meta.url),
    JSON.stringify(
      { version: 1, city: 'St. Petersburg, FL', locations: out },
      null,
      2,
    ),
  )
  console.log(
    `Wrote ${out.length} food/drink candidates to data/food-candidates.json`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
