// @ts-check
/**
 * add-polygons.mjs — backfill `polygon` geometry onto park/golf_course locations.
 *
 * For each `public/locations.<city>.json`, finds in-play rows with
 * `category: 'park' | 'golf_course'` that do not yet have a `polygon` field,
 * queries Overpass for the OSM way/relation by name within the city bbox using
 * `out geom` (not `out center`), applies Douglas–Peucker simplification
 * (ε = 0.00005°, ≈ 5 m) and a 100-node cap, rounds coords to 5 dp, and
 * writes the `polygon` field back in-place.
 *
 * Locations that cannot be matched (no OSM element, node-only result, or
 * post-simplification ring > 100 nodes) are left without a `polygon` and fall
 * back to centroid-point scoring at runtime — no crash, no silent wrong answer.
 *
 * Design details and risk analysis: docs/plans/POLYGON-SCORING.md §4.
 *
 * Usage:
 *   node scripts/add-polygons.mjs [--city <id>] [--dry-run] [--force]
 *
 *   --city <id>   Process only one city (default: all cities in cities.json).
 *   --dry-run     Print what would change; do not write any files.
 *   --force       Overwrite existing polygon fields (for re-fetching after OSM edits).
 *
 * Run: `npm run add-polygons`  (needs Node 18+ for global fetch)
 *
 * [M-C1]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Douglas–Peucker epsilon (degrees). ≈ 5 m at these latitudes. */
const DP_EPSILON_DEG = 0.00005

/** Maximum post-simplification nodes per polygon ring. Elements that exceed
 *  this after D–P are dropped (logged as WARN); location falls back to point
 *  scoring. This avoids multipolygon relations with hundreds of outer nodes
 *  ballooning the bundle. */
const MAX_NODES = 100

/** Coordinate precision (decimal places). 5 dp ≈ 1.1 m — sufficient for a
 *  guessing game; saves bytes vs. Overpass's 7-decimal output. */
const COORD_PRECISION = 5

/** Centroid proximity threshold (metres). If more than one OSM element matches
 *  by name, only candidates whose computed centroid is within this distance of
 *  the stored lat/lng are considered. */
const CENTROID_MATCH_RADIUS_M = 500

/**
 * Categories eligible for polygon backfill in v1.
 *
 * Mirrors `isLargeFootprintCategory` in src/lib/scoring.ts — keep in sync.
 * `nature_reserve` and `marina` are NOT listed here because they map to the
 * `park` category in inferCategory; they are included automatically because
 * location rows carry `category: 'park'`, not their OSM leisure tag.
 *
 * N4 note: `dog_park` and `recreation_ground` are included in the fetch-pois
 * Overpass allowlist and also map to category `park`. They are therefore
 * included in the backfill scope via the `park` category — no separate entry
 * is needed here. The Overpass query in buildPolygonQuery covers them via the
 * `leisure~"park|dog_park|recreation_ground|..."` filter.
 */
const POLYGON_CATEGORIES = new Set(['park', 'golf_course'])

/** Overpass endpoints, tried in order with retries. */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Delay between individual location queries (ms) to avoid throttling. */
const QUERY_DELAY_MS = 2000

// ---------------------------------------------------------------------------
// Overpass fetch (shared retry logic — mirrors fetch-pois.mjs)
// ---------------------------------------------------------------------------

/**
 * POST an Overpass QL query, retrying across endpoints on transient errors.
 *
 * @param {string} query
 * @returns {Promise<{elements: object[]}>}
 *
 * [M-C1]
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchOverpass(query) {
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
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
        const json = JSON.parse(text)
        // A busy server returns HTTP 200 with empty `elements` and a `remark`
        // like "runtime error: Query timed out". Treat that as a transient
        // failure to retry/fall back — NOT a genuine "no match" (otherwise a
        // real park gets silently flagged as missing). See §4d.
        if (json.remark && /error|timed out|timeout/i.test(json.remark)) {
          throw new Error(
            `remark from ${endpoint}: ${json.remark.slice(0, 120)}`,
          )
        }
        return json
      } catch (err) {
        lastErr = err
        console.warn(`  ${endpoint} attempt ${attempt} failed: ${err.message}`)
        await sleep(attempt * 3000)
      }
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed')
}

// ---------------------------------------------------------------------------
// Overpass query builder
// ---------------------------------------------------------------------------

/**
 * Build an Overpass query that fetches ways and relations named exactly
 * `name` within `bbox` that have a leisure or natural tag indicating a
 * large-footprint area. Uses `out geom` to receive full coordinate geometry.
 *
 * @param {string} name        - Exact OSM `name` tag to match.
 * @param {[number,number,number,number]} bbox - [south, west, north, east]
 * @returns {string} Overpass QL query string.
 *
 * [M-C1]
 */
/** Escape a string for use inside an Overpass regex literal. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')
}

/**
 * Build an Overpass query matching ways + relations by NAME within the bbox,
 * with `out geom`. We deliberately do NOT restrict by `leisure` tag: large
 * footprints we care about are tagged inconsistently in OSM — parks
 * (`leisure=park`), nature reserves (`leisure=nature_reserve`), golf courses
 * (`leisure=golf_course`), but also lakes (`natural=water`), beaches, and
 * country clubs (`landuse=*`). A name + bbox + centroid-proximity match plus the
 * closed-area requirement in extractOuterRing (linear ways are rejected) is a
 * safer filter than guessing the right tag set. False positives are caught by
 * the CENTROID_MATCH_RADIUS_M guard in pickBestMatch.
 */
export function buildPolygonQuery(name, bbox) {
  const [s, w, n, e] = bbox
  // Case-insensitive anchored match absorbs capitalisation differences between
  // the curated display name and the OSM `name` tag.
  const pat = `^${escapeRegex(name)}$`
  return `
[out:json][timeout:90];
(
  way["name"~"${pat}",i](${s},${w},${n},${e});
  relation["name"~"${pat}",i](${s},${w},${n},${e});
);
out geom tags;`.trim()
}

// ---------------------------------------------------------------------------
// Geometry helpers (Node-side — cannot import src/lib/geo.ts directly)
// ---------------------------------------------------------------------------

/**
 * Compute the centroid of a list of [lat, lng] coordinate pairs.
 *
 * @param {[number,number][]} coords
 * @returns {{lat: number, lng: number}}
 *
 * [M-C1]
 */
export function centroid(coords) {
  let lat = 0
  let lng = 0
  for (const [la, ln] of coords) {
    lat += la
    lng += ln
  }
  return { lat: lat / coords.length, lng: lng / coords.length }
}

/**
 * Haversine great-circle distance in metres. Duplicated here (cannot import
 * the TypeScript src/lib/geo.ts from a plain .mjs script).
 *
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number}
 *
 * [M-C1]
 */
export function haversineMeters(a, b) {
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Douglas–Peucker polyline simplification (degrees epsilon).
 * Input and output are open rings: [[lat,lng], ...] with first != last.
 *
 * @param {[number,number][]} ring
 * @param {number} epsilonDeg
 * @returns {[number,number][]}
 *
 * [M-C1]
 */
export function douglasPeucker(ring, epsilonDeg) {
  if (ring.length <= 2) return [...ring]
  const keep = new Array(ring.length).fill(false)
  keep[0] = true
  keep[ring.length - 1] = true
  const perp = (p, a, b) => {
    const ax = a[1],
      ay = a[0],
      bx = b[1],
      by = b[0],
      px = p[1],
      py = p[0]
    const dx = bx - ax
    const dy = by - ay
    const mag = Math.hypot(dx, dy)
    if (mag === 0) return Math.hypot(px - ax, py - ay)
    return Math.abs(dx * (ay - py) - (ax - px) * dy) / mag
  }
  const stack = [[0, ring.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()
    let maxDist = -1
    let maxIdx = -1
    for (let i = start + 1; i < end; i++) {
      const d = perp(ring[i], ring[start], ring[end])
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxIdx !== -1 && maxDist > epsilonDeg) {
      keep[maxIdx] = true
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }
  return ring.filter((_, i) => keep[i])
}

// ---------------------------------------------------------------------------
// OSM element → polygon ring extraction
// ---------------------------------------------------------------------------

/**
 * Extract the outer ring from an Overpass element returned by `out geom`.
 *
 * Handles:
 *  - `way`: `el.geometry` is an array of {lat, lon} — the closed ring (first
 *    node repeated at end). We strip the repeated last node to store an open
 *    ring.
 *  - `relation`: `el.members` contains outer/inner members. The `role: 'outer'`
 *    member arcs are STITCHED head-to-tail (reversing as needed) into closed
 *    ring(s) by `stitchOuterRing`; the largest closed ring is returned. This is
 *    how most large parks/lakes are stored (multipolygon relations whose outer
 *    boundary spans several way segments). Holes / inner rings / secondary outer
 *    rings are ignored — a guessing-game footprint doesn't need them.
 *    DISTINCT log messages distinguish the failure modes:
 *      - "has no outer member geometry" — relation has no outer members at all
 *        (unexpected OSM shape).
 *      - "outer arcs did not stitch into a closed ring" — arcs are present but
 *        don't chain into a closed loop (incomplete geometry).
 *    These are separate from "no OSM match found" (logged by pickBestMatch),
 *    so operators can triage geometry problems vs. genuinely-absent features.
 *  - `node`: returns null (no polygon geometry).
 *
 * Returns null if geometry is absent, malformed, or not a closed ring.
 *
 * @param {object} el - Raw Overpass element.
 * @returns {[number,number][] | null} Open ring [[lat,lng],...] or null.
 *
 * [M-C1]
 */
/** Convert an Overpass `geometry` array ([{lat,lon},...]) to an open ring. */
function geomToOpenRing(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 3) return null
  const coords = geometry.map((g) => [g.lat, g.lon])
  // A closed way repeats its first node at the end — strip it for an open ring.
  const first = coords[0]
  const last = coords[coords.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1]
  const open = closed ? coords.slice(0, -1) : coords
  return open.length >= 3 ? open : null
}

/** A node-coordinate key for endpoint matching (7 dp ≈ 1 cm — exact OSM nodes). */
const nodeKey = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`

/**
 * Stitch a relation's `outer` member arcs head-to-tail into closed ring(s).
 *
 * A multipolygon's outer boundary is often split across several way members
 * (arcs) that must be joined at shared endpoints. We greedily chain arcs,
 * reversing as needed, until a ring closes; we then start a fresh ring from any
 * unused arcs. The LARGEST closed ring (most nodes) is returned as the outer
 * boundary — good enough for a guessing-game footprint (we ignore holes and
 * secondary outer rings). Returns an open ring [[lat,lon],...] or null if no
 * arc chain closes.
 *
 * @param {{geometry?: {lat:number,lon:number}[]}[]} outerMembers
 * @returns {[number,number][] | null}
 */
function stitchOuterRing(outerMembers) {
  const arcs = outerMembers
    .map((m) => m.geometry)
    .filter((g) => Array.isArray(g) && g.length >= 2)
  if (arcs.length === 0) return null

  const used = new Array(arcs.length).fill(false)
  /** @type {{lat:number,lon:number}[][]} */
  const closedRings = []

  for (let seed = 0; seed < arcs.length; seed++) {
    if (used[seed]) continue
    let ring = arcs[seed].slice()
    used[seed] = true

    let extended = true
    while (extended) {
      extended = false
      // Closed already?
      if (
        ring.length >= 4 &&
        nodeKey(ring[0]) === nodeKey(ring[ring.length - 1])
      ) {
        break
      }
      const tail = ring[ring.length - 1]
      for (let i = 0; i < arcs.length; i++) {
        if (used[i]) continue
        const a = arcs[i]
        const head = a[0]
        const end = a[a.length - 1]
        if (nodeKey(head) === nodeKey(tail)) {
          ring = ring.concat(a.slice(1))
          used[i] = true
          extended = true
          break
        }
        if (nodeKey(end) === nodeKey(tail)) {
          ring = ring.concat(a.slice(0, -1).reverse())
          used[i] = true
          extended = true
          break
        }
      }
    }

    if (
      ring.length >= 4 &&
      nodeKey(ring[0]) === nodeKey(ring[ring.length - 1])
    ) {
      closedRings.push(ring)
    }
  }

  if (closedRings.length === 0) return null
  // Largest closed ring = the outer boundary we care about.
  const biggest = closedRings.reduce((a, b) => (b.length > a.length ? b : a))
  return geomToOpenRing(biggest)
}

export function extractOuterRing(el) {
  if (el.type === 'way') {
    // Only CLOSED ways are areas. A linear way (a street, a path) that happens
    // to share the location's name must NOT be treated as a polygon ring.
    const g = el.geometry
    if (!Array.isArray(g) || g.length < 4) return null
    const first = g[0]
    const last = g[g.length - 1]
    if (first.lat !== last.lat || first.lon !== last.lon) return null
    return geomToOpenRing(g)
  }
  if (el.type === 'relation') {
    const outers = (el.members || []).filter((m) => m.role === 'outer')
    if (outers.length === 0) {
      console.warn(
        `    WARN: relation ${el.id} has no outer member geometry — skipping`,
      )
      return null
    }
    // Stitch the outer arcs (one self-closed arc is just the trivial case).
    const ring = stitchOuterRing(outers)
    if (!ring) {
      console.warn(
        `    WARN: relation ${el.id} outer arcs did not stitch into a closed ring — skipping`,
      )
      return null
    }
    return ring
  }
  // node or anything else: no polygon geometry.
  return null
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Given a list of Overpass elements returned for a name query, pick the best
 * match for a location with a known centroid at `{lat, lng}`.
 *
 * Algorithm (docs/plans/POLYGON-SCORING.md §4.2):
 *  1. Filter to elements whose centroid is within CENTROID_MATCH_RADIUS_M.
 *  2. If zero candidates → return null (log WARN: no match).
 *  3. If one candidate → return it.
 *  4. If multiple → return the one whose centroid is closest to {lat, lng};
 *     log WARN with all candidate OSM ids for manual review.
 *
 * @param {object[]} elements  - Overpass elements (ways + relations with geom).
 * @param {{lat:number, lng:number}} location - Stored centroid of the location.
 * @param {string} locationId  - Location slug, for warning messages.
 * @returns {object | null}
 *
 * [M-C1]
 */
export function pickBestMatch(elements, location, locationId) {
  // Score each element that yields a usable outer ring by its centroid distance
  // from the stored location point.
  const candidates = []
  for (const el of elements) {
    const ring = extractOuterRing(el)
    if (!ring) continue // already logged its own WARN inside extractOuterRing
    const c = centroid(ring)
    const dist = haversineMeters(location, c)
    candidates.push({ el, ring, dist })
  }

  const within = candidates.filter((c) => c.dist <= CENTROID_MATCH_RADIUS_M)
  if (within.length === 0) {
    if (candidates.length > 0) {
      // We matched by name but every candidate is too far from the stored point.
      const nearest = candidates.reduce((a, b) => (b.dist < a.dist ? b : a))
      console.warn(
        `    WARN: ${locationId} — name matched ${candidates.length} element(s) but nearest centroid is ${Math.round(nearest.dist)} m away (> ${CENTROID_MATCH_RADIUS_M} m); skipping`,
      )
    } else {
      console.warn(`    WARN: ${locationId} — no OSM polygon match found`)
    }
    return null
  }

  within.sort((a, b) => a.dist - b.dist)
  if (within.length > 1) {
    const ids = within.map(
      (c) => `${c.el.type}/${c.el.id}@${Math.round(c.dist)}m`,
    )
    console.warn(
      `    NOTE: ${locationId} — ${within.length} candidates within ${CENTROID_MATCH_RADIUS_M} m, picking nearest. All: ${ids.join(', ')}`,
    )
  }
  return within[0].el
}

// ---------------------------------------------------------------------------
// Per-location pipeline
// ---------------------------------------------------------------------------

/**
 * Fetch, extract, simplify, and cap the polygon for one location.
 *
 * Returns the open ring `[number,number][]` to store, or null if the location
 * should be left without a polygon (with a reason logged).
 *
 * @param {{ id: string, name: string, lat: number, lng: number }} location
 * @param {[number,number,number,number]} bbox
 * @param {string} nameOverride - Optional: use this name for the OSM query
 *   instead of `location.name` (for locations whose display name differs from
 *   their OSM `name` tag).
 * @returns {Promise<{ ring: [number,number][] | null, reason: string }>}
 *   `ring` is the open ring to store, or null with a machine-readable `reason`
 *   ('no-match' | 'unusable-geometry' | 'too-many-nodes') for the backfill
 *   report so the operator can web-search the misses.
 *
 * [M-C1]
 */
/** Round a coordinate pair to COORD_PRECISION decimal places. */
function roundCoord([lat, lng]) {
  const f = 10 ** COORD_PRECISION
  return [Math.round(lat * f) / f, Math.round(lng * f) / f]
}

async function fetchPolygonForLocation(location, bbox, nameOverride) {
  const queryName = nameOverride ?? location.name
  const query = buildPolygonQuery(queryName, bbox)
  const { elements } = await fetchOverpass(query)
  if (!elements || elements.length === 0) {
    console.warn(`    WARN: ${location.id} — no OSM polygon match found`)
    return { ring: null, reason: 'no-match' }
  }

  const best = pickBestMatch(elements, location, location.id)
  if (!best) return { ring: null, reason: 'no-match' } // pickBestMatch logged it

  const ring = extractOuterRing(best)
  if (!ring) return { ring: null, reason: 'unusable-geometry' } // logged inside

  const simplified = douglasPeucker(ring, DP_EPSILON_DEG)
  if (simplified.length > MAX_NODES) {
    console.warn(
      `    WARN: ${location.id} — ${best.type}/${best.id} simplified to ${simplified.length} nodes (> ${MAX_NODES} cap); skipping (falls back to point scoring)`,
    )
    return { ring: null, reason: 'too-many-nodes' }
  }

  return { ring: simplified.map(roundCoord), reason: 'ok' }
}

// ---------------------------------------------------------------------------
// Name override map
// ---------------------------------------------------------------------------

/**
 * Hand-maintained overrides for locations whose display name in the dataset
 * differs from the OSM `name` tag. Key = location id; value = OSM name to
 * query with.
 *
 * Extend this as the dry-run output reveals unmatched locations.
 *
 * @type {Record<string, string>}
 *
 * [M-C1]
 */
const NAME_OVERRIDES = {}

// ---------------------------------------------------------------------------
// City processing
// ---------------------------------------------------------------------------

/**
 * Process one city: read its locations JSON, backfill polygons for eligible
 * rows, and write the updated file (unless --dry-run).
 *
 * @param {{ id: string, bounds: [[number,number],[number,number]] }} city
 * @param {{ dryRun: boolean, force: boolean }} opts
 * @returns {Promise<void>}
 *
 * [M-C1]
 */
async function processCity(city, opts) {
  const file = path.join(ROOT, 'public', `locations.${city.id}.json`)
  const data = JSON.parse(await readFile(file, 'utf8'))
  const [[s, w], [n, e]] = city.bounds
  /** @type {[number,number,number,number]} */
  const bbox = [s, w, n, e]

  // Eligible = in-play, large-footprint category. We only backfill in-play rows
  // because only those are ever scored; the rest carry no difficulty/polygon.
  const eligible = data.locations.filter(
    (l) => l.inPlay && POLYGON_CATEGORIES.has(l.category),
  )
  const todo = opts.force
    ? eligible
    : eligible.filter(
        (l) => !Array.isArray(l.polygon) || l.polygon.length === 0,
      )

  console.log(
    `\n=== ${city.id} === ${eligible.length} eligible large-footprint rows, ${todo.length} to fetch${opts.force ? ' (--force)' : ''}`,
  )

  let matched = 0
  /** @type {{id:string,name:string,city:string,lat:number,lng:number,reason:string}[]} */
  const misses = []

  for (let i = 0; i < todo.length; i++) {
    const loc = todo[i]
    const override = NAME_OVERRIDES[loc.id]
    process.stdout.write(
      `  [${i + 1}/${todo.length}] ${loc.id} (${loc.name})… `,
    )
    let result
    try {
      result = await fetchPolygonForLocation(loc, bbox, override)
    } catch (err) {
      console.warn(`\n    ERROR: ${loc.id} — ${err.message}`)
      result = { ring: null, reason: 'fetch-error' }
    }
    if (result.ring) {
      loc.polygon = result.ring
      matched++
      console.log(`✓ ${result.ring.length} nodes`)
    } else {
      // Leave the row without a polygon and flag it for manual web-search.
      misses.push({
        id: loc.id,
        name: loc.name,
        city: city.id,
        lat: loc.lat,
        lng: loc.lng,
        reason: result.reason,
      })
      console.log(`— (${result.reason})`)
    }
    // Be polite to the public Overpass instances.
    if (i < todo.length - 1) await sleep(QUERY_DELAY_MS)
  }

  // State-of-the-world counts (independent of how many this run newly fetched):
  // every eligible row that currently has a polygon vs. those still point-only.
  const withPolygon = eligible.filter(
    (l) => Array.isArray(l.polygon) && l.polygon.length > 0,
  ).length

  console.log(
    `  ${city.id}: +${matched} this run; ${withPolygon}/${eligible.length} eligible now have polygons, ${eligible.length - withPolygon} still point-only`,
  )

  if (!opts.dryRun && matched > 0) {
    await writeFile(file, JSON.stringify(data, null, 2) + '\n')
    console.log(`  wrote ${file}`)
  } else if (opts.dryRun) {
    console.log(`  --dry-run: not writing ${file}`)
  }

  return {
    city: city.id,
    eligible: eligible.length,
    withPolygon,
    matched,
    misses,
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/** Parse CLI flags: --city <id>, --dry-run, --force. */
function parseArgs(argv) {
  const opts = { city: null, dryRun: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--force') opts.force = true
    else if (a === '--city') opts.city = argv[++i]
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const cities = JSON.parse(
    await readFile(path.join(ROOT, 'cities.json'), 'utf8'),
  )
  const selected = opts.city ? cities.filter((c) => c.id === opts.city) : cities
  if (selected.length === 0) {
    throw new Error(`No city matches --city ${opts.city}`)
  }

  /** @type {{id:string,name:string,city:string,lat:number,lng:number,reason:string}[]} */
  const allMisses = []
  let totalNewMatches = 0
  let totalWithPolygon = 0
  let totalEligible = 0

  for (const city of selected) {
    const { eligible, withPolygon, matched, misses } = await processCity(
      city,
      opts,
    )
    totalEligible += eligible
    totalWithPolygon += withPolygon
    totalNewMatches += matched
    allMisses.push(...misses)
  }

  // Flag every large-footprint location left WITHOUT a polygon so the operator
  // can web-search the geometry — per the owner's rule: no large park should
  // remain a single point. See docs/plans/POLYGON-SCORING.md §4d.
  //
  // Counts reflect the CURRENT dataset state, not just this run: `withPolygon`
  // is every eligible row that has a polygon now; `newMatchesThisRun` is how
  // many this invocation freshly fetched. A miss listed with reason
  // `fetch-error`/`no-match` may be a transient Overpass rate-limit casualty —
  // re-run (idempotent) before assuming a feature is genuinely absent from OSM.
  const reportPath = path.join(ROOT, 'data', 'polygon-backfill-report.json')
  const report = {
    generatedFrom: opts.city ?? 'all-cities',
    dryRun: opts.dryRun,
    totalEligible,
    totalWithPolygon,
    totalPointOnly: allMisses.length,
    newMatchesThisRun: totalNewMatches,
    pointOnly: allMisses.sort(
      (a, b) => a.city.localeCompare(b.city) || a.id.localeCompare(b.id),
    ),
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')

  console.log(
    `\n========\nTotal: ${totalWithPolygon}/${totalEligible} eligible have polygons (+${totalNewMatches} this run) across ${selected.length} cit${selected.length === 1 ? 'y' : 'ies'}.`,
  )
  console.log(
    `${allMisses.length} large-footprint location(s) still point-only — see ${path.relative(ROOT, reportPath)} and web-search their geometry.`,
  )
  if (allMisses.length > 0) {
    for (const m of allMisses) {
      console.log(`  - [${m.city}] ${m.name} (${m.id}) — ${m.reason}`)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
