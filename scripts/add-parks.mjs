// @ts-check
/**
 * One-off curation: add requested + gap-filling St. Pete parks/lakes (and the
 * Rec Dec sports bar) to the dataset. Writes to BOTH:
 *   - data/stpete-manual.json   (committed must-include source; survives rebuild)
 *   - public/locations.stpete.json (the served, difficulty-enriched file)
 *
 * Coordinates are from OpenStreetMap Nominatim (the project's own geocoder).
 * Difficulty is hand-assigned (the fame pass is a one-off that won't re-run; see
 * scripts/apply-difficulty-stpete.mjs) and embedded in the manual entries so a
 * future `build-city` rebuild keeps it.
 *
 * Run once: node scripts/add-parks.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

/** @type {Array<[string, number, number, 'park'|'bar', 'easy'|'medium'|'hard', string]>} */
const RAW = [
  // --- requested via GitHub issues #42–47 ---
  [
    'Williams Park',
    27.772822,
    -82.6378037,
    'park',
    'medium',
    'A historic downtown square — the city’s old central gathering park, ringed by churches and a bandshell.',
  ],
  [
    'Mirror Lake',
    27.7741062,
    -82.6423321,
    'park',
    'medium',
    'A small lake just northwest of downtown that gives its name to the surrounding historic neighborhood and library.',
  ],
  [
    'Crescent Lake Park',
    27.7884526,
    -82.6413034,
    'park',
    'medium',
    'A large lake-centered park north of downtown with a walking loop, ballfields, and the old Huggins-Stengel field.',
  ],
  [
    'Fossil Park',
    27.8334822,
    -82.6454972,
    'park',
    'hard',
    'A north St. Pete neighborhood park and recreation center off Dr. MLK Jr. St N.',
  ],
  [
    'Bartlett Park',
    27.7504367,
    -82.6404999,
    'park',
    'hard',
    'A south-side neighborhood park with a historic pool and recreation center.',
  ],
  // "rec deck" in issue #42 == "Rec Dec", a sports bar / social athletic club.
  [
    'Rec Dec',
    27.8682622,
    -82.6330285,
    'bar',
    'hard',
    'A Gandy-area sports bar and social athletic club with lighted volleyball courts, cornhole, and a kitchen.',
  ],

  // --- gap-fill: notable St. Pete parks/lakes the dataset was missing ---
  [
    'North Straub Park',
    27.776281,
    -82.6312195,
    'park',
    'medium',
    'A downtown waterfront green along Bayshore Drive, just north of the museums.',
  ],
  [
    'South Straub Park',
    27.7727126,
    -82.6324133,
    'park',
    'medium',
    'A downtown waterfront green along Bayshore Drive, south of its sibling park.',
  ],
  [
    'Albert Whitted Park',
    27.7664909,
    -82.629542,
    'park',
    'medium',
    'A waterfront park by Albert Whitted Airport at the south end of the downtown waterfront.',
  ],
  [
    'Lake Vista Park',
    27.7133102,
    -82.6525362,
    'park',
    'hard',
    'A southside community park around a small lake, with a pool and rec center.',
  ],
  [
    'Lake Maggiore',
    27.7355582,
    -82.6525332,
    'park',
    'medium',
    'The city’s largest lake, on the south side next to Boyd Hill Nature Preserve.',
  ],
  [
    'Sawgrass Lake Park',
    27.8413442,
    -82.6689052,
    'park',
    'medium',
    'A north St. Pete nature park with a boardwalk through one of the area’s largest maple swamps.',
  ],
  [
    'Gizella Kopsick Palm Arboretum',
    27.782663,
    -82.6259248,
    'park',
    'medium',
    'A waterfront arboretum of palms and cycads next to North Shore Park.',
  ],
  [
    'Round Lake',
    27.7791054,
    -82.639802,
    'park',
    'hard',
    'A small historic lake and surrounding park in the Round Lake neighborhood.',
  ],
  [
    'Maximo Park',
    27.7111002,
    -82.6822738,
    'park',
    'hard',
    'A waterfront park at the city’s southwest tip near the Skyway approach, with a boat ramp.',
  ],
  [
    'Clam Bayou Nature Preserve',
    27.7387692,
    -82.6903026,
    'park',
    'hard',
    'A coastal mangrove preserve and paddling spot on the southwest edge of the city.',
  ],
  [
    'Azalea Park',
    27.7858082,
    -82.7392293,
    'park',
    'medium',
    'A westside community park and recreation center near the Azalea neighborhood.',
  ],
  [
    'Demens Landing Park',
    27.7706739,
    -82.6295843,
    'park',
    'medium',
    'A downtown waterfront park and marina at the foot of 1st Ave S, named for the city’s railroad founder.',
  ],
  [
    'Pioneer Park',
    27.7707949,
    -82.6328281,
    'park',
    'hard',
    'A small downtown park just west of the waterfront, near the Dalí Museum and Albert Whitted.',
  ],
]

const FIELD_ORDER = [
  'id',
  'name',
  'lat',
  'lng',
  'category',
  'difficulty',
  'clue',
  'photoUrl',
  'source',
  'attribution',
]

/** @param {boolean} withDifficulty */
function buildEntries(withDifficulty) {
  return RAW.map(([name, lat, lng, category, difficulty, clue]) => {
    /** @type {Record<string, unknown>} */
    const e = {
      id: slug(name),
      name,
      lat,
      lng,
      category,
      difficulty,
      clue,
      photoUrl: null,
      source: 'manual',
      attribution: 'OpenStreetMap ODbL (geocoded via Nominatim)',
    }
    if (!withDifficulty) delete e.difficulty
    const o = {}
    for (const k of FIELD_ORDER) if (k in e) o[k] = e[k]
    return o
  })
}

/** @param {string} path @param {any[]} newEntries @param {(a:any,b:any)=>number} sort */
function mergeInto(path, newEntries, sort) {
  const url = new URL('../' + path, import.meta.url)
  const data = JSON.parse(readFileSync(url, 'utf8'))
  const existing = new Set(data.locations.map((/** @type {any} */ l) => l.id))
  const existingNames = new Set(
    data.locations.map((/** @type {any} */ l) => l.name.toLowerCase()),
  )
  let added = 0
  for (const e of newEntries) {
    if (existing.has(e.id) || existingNames.has(e.name.toLowerCase())) {
      console.warn(`  skip (already present): ${e.name}`)
      continue
    }
    data.locations.push(e)
    existing.add(e.id)
    existingNames.add(e.name.toLowerCase())
    added++
  }
  data.locations.sort(sort)
  writeFileSync(url, JSON.stringify(data, null, 2) + '\n')
  console.log(`${path}: +${added} (now ${data.locations.length})`)
}

const byId = (/** @type {any} */ a, /** @type {any} */ b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0
const byName = (/** @type {any} */ a, /** @type {any} */ b) =>
  a.name.localeCompare(b.name)

// public file is difficulty-enriched and sorted by id; manual file is the
// must-include source (also keep difficulty so a rebuild preserves it).
mergeInto('public/locations.stpete.json', buildEntries(true), byId)
mergeInto('data/stpete-manual.json', buildEntries(true), byName)
