# Polygon-Aware Scoring — Implementation Plan

**Status:** ✅ **SHIPPED in #97** (commit `3e078a4`). This document is the
ratified design, kept for reference; the feature is fully implemented and merged.
**Affects:** scoring logic, types, data pipeline, MapGuess UI, 5 city datasets

---

## Review round 1 — resolutions

Addressed in response to the adversarial reviewer's BLOCK. Each item is
`fixed`, `partially fixed`, or `deferred` with rationale.

### Must-fix items

**MF-1 — `scoreForDistance` not parameterised (scoring was a no-op)** — FIXED  
`scoreForDistance` now accepts `perfectRadiusM: number = PERFECT_RADIUS_M` as
a second parameter (default 300 preserves backward compatibility for all
existing callers). `scoreGuess` is updated to branch on FOUR cases and pass
the right radius to each:
- **polygon + inside** → `{ distanceMeters: 0, score: MAX_ROUND_SCORE }`.
- **polygon + outside** → `scoreForDistance(edgeDist, 0)` — falloff starts
  at the polygon edge, no freebie ring.
- **point + large-footprint category + no polygon** → `scoreForDistance(centroidDist, LARGE_FALLBACK_RADIUS_M)` (300m) — prevents regression for parks whose polygon was dropped.
- **point + normal** → `scoreForDistance(centroidDist, POINT_PERFECT_RADIUS_M)` (100m).  
New helper `isLargeFootprintCategory(category)` (exported, testable) decides
the third case. `LARGE_FALLBACK_RADIUS_M = 300` is a new exported constant.
See §3.4 for the updated spec and §6.1 for new `scoreGuess` test cases.  
Files: `src/lib/scoring.ts`.

**MF-2 — Ray-casting vertex/edge boundary is undeliverable with naive even-odd counting** — FIXED  
Algorithm spec updated in `geo.ts` JSDoc (the `pointInPolygon` function
comment) and §3.3 of this plan. The implementer must:
1. Run an explicit point-on-segment check (epsilon = 1e-10 degrees) over all
   edges FIRST; return true immediately if the point is on any edge/vertex.
2. THEN run ray-casting with the half-open vertex rule
   `(yi > py) !== (yj > py)` to avoid vertex double-counting for interior
   points.  
Test cases for vertex and edge boundary are preserved.  
Files: `src/lib/geo.ts` (JSDoc), §3.3 in this plan.

**MF-3 — MapGuess polygon CREATION half missing from stub** — FIXED  
`MapGuess.tsx` now carries a clearly marked TODO block showing:
- Where to create `L.polygon(...)` and assign to `polygonLayerRef.current`.
- The full `L.featureGroup([truthMarkerRef, lineRef, polygonLayerRef])` -based
  `fitBounds` pattern that replaces the current guess↔truth bounding box so
  the polygon is always framed in the reveal view (not clipped).  
§5 of this plan is updated to be unambiguous about both creation and
`featureGroup`-based `fitBounds`.  
Files: `src/components/MapGuess.tsx`, §5 in this plan.

**MF-4 — `geo.ts` contradiction: "not exported" banner above exported `haversineMeters`** — FIXED  
The misleading banner ("Internal helpers (not exported)") has been replaced
with "Exported utility — also used internally by distanceToPolygonMeters".
Decision on duplication: **`geo.ts` is the single app-side owner of
`haversineMeters`**. `scoring.ts` currently has its own copy; when [M-B1] is
implemented the local copy in `scoring.ts` must be removed and replaced with
`import { haversineMeters } from './geo'` (the import comment in `scoring.ts`
already reflects this). The `.mjs` backfill script copy is accepted duplication
(plain Node scripts cannot import TypeScript — noted in N2 and the geo.ts
JSDoc).  
Files: `src/lib/geo.ts` (banner), `src/lib/scoring.ts` (import comment).

### Should-fix items

**SF-5 — perfectRadius=0 for polygon-outside** — FIXED via MF-1  
Resolved by the `scoreForDistance(edgeDist, 0)` call in the polygon+outside
branch of `scoreGuess`. Even 1m outside the polygon edge returns <100.

**SF-6 — Milestone prose "parallel with B and C" ignores A1→D1 dependency** — FIXED  
§6 M-D prose now explicitly states: "D1 depends on A1 (`polygon?` type must
be compiled before MapGuess.tsx can reference it)". See updated §6 below.

**SF-7 — Large parks with no polygon regressing to 100m radius** — FIXED via MF-1  
The `LARGE_FALLBACK_RADIUS_M = 300` branch in `scoreGuess` (case 3) prevents
this regression. Referenced in §7.3 and §7.7.

**SF-8 — Multipolygon outer-ring stitching: indistinct log messages** — FIXED  
`extractOuterRing` stub in `add-polygons.mjs` now specifies three DISTINCT
log messages: "outer ring is multi-arc (not stitched, v1 skip)" vs. "no outer
member geometry" vs. "no OSM match found" (from `pickBestMatch`). Updated
in §7.2 of this plan.  
Files: `scripts/add-polygons.mjs` (JSDoc), §7.2 in this plan.

### Nits

**N2 — Third `haversineMeters`/`douglasPeucker` copy in `add-polygons.mjs`** — NOTED  
The `.mjs` script cannot import TypeScript sources without a build step. The
duplicate implementations in `add-polygons.mjs` are accepted and documented in
the geo.ts `haversineMeters` JSDoc and in this plan. No action taken.

**N4 — `dog_park`/`recreation_ground` in backfill tag filter** — ADDRESSED  
`POLYGON_CATEGORIES` comment in `add-polygons.mjs` now explains that
`dog_park` and `recreation_ground` map to category `park` in `inferCategory`,
so location rows with those OSM origins already carry `category: 'park'` and
are included in the backfill scope automatically. The `buildPolygonQuery`
Overpass filter must include those leisure tags when querying OSM (the
implementer is directed to mirror `fetch-pois.mjs`'s full tag list). See
§4.1 updated query.

**N-B — `RoundResult.distanceMeters` JSDoc misleading for polygon hits** — FIXED  
The JSDoc on `RoundResult.distanceMeters` in `src/types.ts` now explains all
three semantic cases (point centroid / polygon inside = 0 / polygon outside =
edge distance). Added to §9 doc-update checklist.  
Files: `src/types.ts`.

### Owner decisions baked in

- v1 polygon scope = `park` + `golf_course` only. Venues/stadiums + cemetery
  deferred to v2 (noted in §2 and §8).
- `POINT_PERFECT_RADIUS_M = 100`, `LARGE_FALLBACK_RADIUS_M = 300`.
- Polygon data committed into JSON — confirmed.
- `nature_reserve`/`marina` ride along via `category: 'park'` — fine.

---

## 1. Problem and goals

Large-footprint locations (parks, golf courses) are currently scored by
haversine distance to their centroid point. A player who correctly places their
pin inside a large park is penalised because the centroid may be far from where
they clicked. This feature:

1. Adds an optional `polygon` field to `Location` (outer ring only, v1).
2. Changes `scoreGuess` so a pin **inside** a polygon always scores 100, and a
   pin **outside** falls off from the nearest polygon edge.
3. Tightens point scoring from 300m to 100m to remove the "free zone" that
   polygons make irrelevant for large places.
4. Backfills polygon data for ~210 in-play park/golf_course locations via a new
   `scripts/add-polygons.mjs` script.
5. Renders the polygon on reveal in `MapGuess.tsx` using raw Leaflet.

---

## 2. Key numbers from reading the codebase

| Metric | Value |
|--------|-------|
| In-play park + golf_course locations (all 5 cities) | **210** |
| Of those with `source: 'overpass'` | 190 (matchable by name+bbox) |
| Of those with `source: 'manual'` | 20 (name+bbox still matchable in OSM) |
| Locations with an `osmId` field stored | **0** (biggest risk — see §7.1) |
| Largest city JSON (`chicago.json`) | **1.3 MB** |
| Estimated polygon data added to chicago.json | **~35 KB** (35 nodes/polygon avg, 5-dp coords) |
| Estimated polygon data added across all 5 files | **~165 KB total** |
| Venue-category locations | 112 total but mix of theaters + stadiums; **excluded from v1 polygon scope** |

The venue category conflates large-footprint stadiums (Tropicana Field, Beaver
Stadium, Michigan Stadium) with small theaters (Jannus Live, Benaroya Hall).
Assigning polygons by category alone would be wrong. **v1 scope is restricted to
`park` and `golf_course` categories**, which are reliably large-footprint. Venue
polygon support can be added in a follow-up by checking OSM element type.

---

## 3. Architecture

### 3.1 Data shape — `polygon` on `Location`

```ts
// Added to Location in src/types.ts
polygon?: [number, number][]   // outer ring only: [[lat, lng], ...]
                               // closed or open — code normalises at use-time
```

**Rationale:**
- A flat `[lat, lng][]` array is the minimal shape; no GeoJSON wrapper overhead.
- Outer ring only in v1. GeoJSON's multi-ring format (`[ring, hole, hole]`) is
  left for a future follow-up (see §7.4). The vast majority of city parks have
  no relevant internal holes.
- Coordinate precision is **5 decimal places** (≈ 1.1m) — sufficient for a
  guessing game; rounds off Overpass's 7-decimal output and saves bytes.
- **Closed vs. open ring:** the raw Overpass way repeats the first node at the
  end. We store the ring **open** (first node NOT repeated at the end) and all
  consumers normalise on read. This saves one coordinate per polygon.
- **Douglas–Peucker simplification** at ε = 0.00005° (≈ 5m at these latitudes)
  before writing. For park-scale polygons this typically reduces node count from
  100–500 to 20–60. We additionally cap at **100 nodes** per polygon; any
  element that would exceed 100 nodes after simplification is dropped (recorded
  as a warning — the location falls back to point scoring). Parks with > 100
  post-simplification nodes are either multipolygon relations too complex for
  v1, or huge county-level parks where the centroid is already a reasonable
  target.
- **Bundle impact:** ~35 KB added to chicago.json (the largest file), ~165 KB
  across all 5 files. Chicago.json goes from 1.3 MB to ~1.34 MB. Acceptable.

### 3.2 Geometry module — `src/lib/geo.ts` (new)

Extracted into a dedicated file (not appended to scoring.ts) for these reasons:
- `scoring.ts` is already a coherent "distance → score" unit; polygon geometry
  is a different concern.
- `geo.ts` can be imported by both `scoring.ts` (for `scoreGuess`) and the
  backfill script without creating circular imports.
- The new functions are pure, have no deps on other app modules, and benefit
  from being co-located with their test file.

**Exports from `src/lib/geo.ts`:**

```ts
/** A coordinate pair [lat, lng]. */
export type LatLng = [number, number]

/** A polygon ring (open — first point NOT repeated). */
export type Ring = LatLng[]

/**
 * Ray-casting point-in-polygon for a single ring.
 * Boundary is treated as INSIDE (inclusive).
 */
export function pointInPolygon(point: LatLng, ring: Ring): boolean

/**
 * Minimum distance in METERS from a point to the nearest edge of a ring.
 * Returns 0 if pointInPolygon returns true.
 * Uses an equirectangular local projection for segment distance, then haversine
 * for the final metre conversion. Error < 0.01% at city scale (see §3.3).
 */
export function distanceToPolygonMeters(point: LatLng, ring: Ring): number

/**
 * Douglas–Peucker polyline simplification (for use in add-polygons.mjs).
 * Not used at game-time.
 */
export function douglasPeucker(ring: Ring, epsilonDeg: number): Ring
```

### 3.3 Geometry approach and error analysis

**pointInPolygon — two-step algorithm (must be implemented in this order):**

Naive even-odd ray-casting FAILS for the boundary test cases (vertex hits and
edge hits). The implementer MUST use the following two-step approach:

**Step 1 — Explicit boundary check (before ray-casting):**
For every edge (vertices[i] → vertices[j]), test whether the query point lies
on the segment within epsilon (1e-10 degrees). If yes, return `true`
immediately. This correctly handles:
- Vertex hits: a naive ray that passes exactly through a shared vertex
  counts it twice (once for each adjacent edge), giving wrong parity.
- Edge hits: FP arithmetic makes "exactly on a line" unreliable in
  ray-casting; the explicit segment check is the right tool.

**Step 2 — Ray-casting for interior points:**
Cast a horizontal ray (+∞ on the lng axis). Count edge crossings using the
half-open vertex rule: count edge (i→j) only when
`(yi > py) !== (yj > py)`. This ensures a vertex on the ray is counted by
exactly one of its two adjacent edges, not both — preserving parity for
interior points. (Boundary points are already handled by Step 1 and never
reach Step 2.)

**Planar ray-casting on raw lat/lng:** At city scale (bounding boxes 0.25°×0.25°
to 0.5°×0.5°), the lat/lng plane distortion in the x-axis is `cos(lat)` —
about 0.67 to 0.89 at the latitudes of our 5 cities (27°–48°N). Ray-casting
correctness depends only on the **topology** of intersections with the
horizontal ray, not on metric distances. The distortion scales both the ring
and the test point uniformly, so topological correctness is preserved. The
antimeridian is irrelevant (all cities are continental US, far from ±180°).

**distanceToPolygonMeters:** uses a local equirectangular projection to find the
nearest point on each segment, then converts back to geodetic coordinates and
runs haversine for the final metre result. Specifically:

1. Project all ring vertices and the query point into a local (x, y) space:
   `x = lng * cos(refLat * π/180)`, `y = lat`, where `refLat` is the polygon's
   centroid latitude. This undistorts the longitude axis.
2. Find the nearest point on each segment in (x, y) space using the standard
   parametric projection formula.
3. For the nearest candidate point, convert back to (lat, lng) and call
   `haversineMeters` for the true geodetic distance.

Error bound: the equirectangular projection over a city-scale polygon (≤ 5 km
diagonal) introduces error on the order of `(d/R)² / 2` where R = 6,371 km and
d = max polygon extent ≈ 5 km. This gives `(5/6371)² / 2 ≈ 3 × 10⁻⁸` or
**< 0.01%** — well under 1 metre across all our city scales. Verified by
calculation for the five cities (latitude range 27°–48°N).

### 3.4 Scoring changes — `src/lib/scoring.ts`

**New/changed constants:**

```ts
/** Tightened perfect radius for ordinary point locations. */
export const POINT_PERFECT_RADIUS_M = 100

/**
 * Fallback perfect radius for large-footprint categories (park, golf_course)
 * when NO polygon is available — prevents regression for parks whose polygon
 * was dropped by the 100-node cap or was unmatched in OSM.
 */
export const LARGE_FALLBACK_RADIUS_M = 300

/** @deprecated — scoreForDistance now takes perfectRadiusM as a parameter.
 *  Retained as the default argument value (300) for backward compat. */
export const PERFECT_RADIUS_M = 300
```

**Parameterised `scoreForDistance`:**

```ts
export function scoreForDistance(
  distanceMeters: number,
  perfectRadiusM: number = PERFECT_RADIUS_M,  // default = 300, backward compat
): number
```

**New testable helper:**

```ts
/** Returns true for categories that are inherently large-footprint. */
export function isLargeFootprintCategory(
  _category: LocationCategory,
): boolean
```
Initial set: `{ 'park', 'golf_course' }`. Extend here if new large-footprint
categories are added. Exported so `add-polygons.mjs` can reuse the same
predicate for its Overpass scope (mirrors `POLYGON_CATEGORIES` in that script).

**`scoreGuess` — four branches (implement in this order):**

| # | Condition | `distanceMeters` | `score` |
|---|-----------|-----------------|---------|
| 1 | polygon non-empty AND `pointInPolygon` | `0` | `MAX_ROUND_SCORE` |
| 2 | polygon non-empty AND NOT `pointInPolygon` | `distanceToPolygonMeters(...)` | `scoreForDistance(edgeDist, 0)` |
| 3 | `isLargeFootprintCategory` AND no polygon | haversine to centroid | `scoreForDistance(centroidDist, LARGE_FALLBACK_RADIUS_M)` |
| 4 | everything else (normal point) | haversine to centroid | `scoreForDistance(centroidDist, POINT_PERFECT_RADIUS_M)` |

Branch 2 uses `perfectRadiusM = 0`: falloff begins AT the polygon edge — even
1 m outside scores <100. No freebie ring outside the polygon.

Branch 3 uses `LARGE_FALLBACK_RADIUS_M = 300`: prevents regressing large parks
whose polygon was dropped by the 100-node cap. Without this, a player who
correctly pins "inside" a large park (but whose polygon is missing) gets
penalised by the tighter 100m radius instead of the old generous 300m.

**Explicit test cases for `scoreGuess` (add to `scoring.test.ts` [M-B1]):**
- point-normal at exactly 100m → score: `MAX_ROUND_SCORE`
- point-normal at 131m → score: `< MAX_ROUND_SCORE`
- point-large-no-polygon at 250m → score: `MAX_ROUND_SCORE` (LARGE_FALLBACK covers)
- point-large-no-polygon at 301m → score: `< MAX_ROUND_SCORE`
- polygon-outside at 1m → score: `< MAX_ROUND_SCORE` (perfectRadius = 0)
- polygon-inside → `{ distanceMeters: 0, score: MAX_ROUND_SCORE }`

**`distanceMeters` semantics in `RoundResult`:**
- Polygon inside-hit → `0`. UI shows "0 m", which is honest.
- Polygon outside-hit → distance to nearest polygon edge (NOT centroid).
- Point → haversine to centroid.

`RoundResult.distanceMeters` JSDoc in `src/types.ts` updated to reflect all
three cases (see §9 doc-update checklist).

---

## 4. Backfill script — `scripts/add-polygons.mjs`

### 4.1 Approach

A new idempotent script that:
1. Reads each `public/locations.<city>.json`.
2. Selects rows where `category` is `park` or `golf_course` AND `polygon` is not
   already set.
3. For each such row, queries Overpass for **ways or relations** matching the
   location's `name` within the city's bounding box using `out geom` (not
   `out center`).
4. Picks the best-matching OSM element (see §4.2).
5. Extracts the outer ring geometry, simplifies it with Douglas–Peucker at
   ε = 0.00005°, caps at 100 nodes, rounds coords to 5 decimal places.
6. Writes the `polygon` field back to the location entry in-place; leaves all
   other fields (name, clue, difficulty, fameScore, etc.) untouched.
7. If no matching element is found, or the element is a node (no geometry), or
   the simplified ring exceeds 100 nodes, logs a warning and leaves `polygon`
   unset. The location falls back to point scoring — no runtime breakage.
8. Writes the updated JSON back with `JSON.stringify(…, null, 2)`.

**Idempotency:** the script skips rows that already have a `polygon` field. A
full re-run only processes newly-added locations or ones where `polygon` was
manually deleted for re-fetch.

### 4.2 OSM element matching (the central risk — see §7.1)

The existing `Location` rows store **no OSM element id**. The only reliable
identifiers available are `name` (display name) and `{lat, lng}` (the
representative point). The script uses a two-stage match:

**Stage 1 — Overpass name query (within city bbox):**
```
[out:json][timeout:90];
(
  way["name"="<escaped name>"]["leisure"~"park|golf_course|nature_reserve|marina|dog_park|recreation_ground|garden"](bbox);
  relation["name"="<escaped name>"]["leisure"~"park|golf_course|nature_reserve|marina|dog_park|recreation_ground|garden"](bbox);
  way["name"="<escaped name>"]["natural"~"water|wood"](bbox);
);
out geom tags;
```

`dog_park` and `recreation_ground` are included because they are in the
`fetch-pois.mjs` Overpass allowlist and map to `category: 'park'` in
`inferCategory`. Location rows with those OSM origins carry `category: 'park'`
and are therefore in scope for polygon backfill. The `buildPolygonQuery`
implementer must mirror this full tag list. (Resolved: Nit N4.)

Returns all ways/relations with that exact name in the city bbox.

**Stage 2 — centroid proximity filter:**
For each candidate returned, compute the centroid of its geometry. Keep only
candidates whose centroid is within **500 m** of the location's stored
`{lat, lng}`. If exactly one candidate remains → use it. If zero → no polygon
(warn). If two or more → pick the one whose centroid is closest to the stored
lat/lng.

**Known failure modes:**

- **Name collision within city bbox:** "Central Park" appears twice in a large
  city bbox. Proximity filter usually resolves this. If not (centroids within
  500m of each other), we take the closest-centroid candidate and log a warning
  flagging it for manual review.
- **Manual-source locations:** these have coordinates from Nominatim, which
  typically points to a node on the OSM element or its centroid. The 500m
  proximity filter still applies and works correctly.
- **OSM way vs. relation:** some parks are mapped as relations (multipolygons).
  v1 handles the **outer ring of the first outer member** of a relation. For
  simple parks this is correct. Relation-with-holes is scoped to v1 as "outer
  ring only" (see §7.4).
- **Name not in OSM:** a few manually-added locations use human-adjusted names
  that differ from the OSM `name` tag (e.g. capitalisation, "Park" suffix). The
  script should try an exact match first, then a case-insensitive match. If
  still no match, log the name and skip.
- **Rate limiting:** Overpass public endpoints throttle concurrent queries.
  The script batches requests with a 2-second delay between individual queries
  and uses the same endpoint retry logic as `fetch-pois.mjs`.

### 4.3 Script flags

```
node scripts/add-polygons.mjs [--city <id>] [--dry-run] [--force]
```

- `--city <id>`: process only one city (default: all 5).
- `--dry-run`: print what would change without writing.
- `--force`: overwrite existing `polygon` fields (for re-fetch after OSM edits).

### 4.4 Which existing Overpass output format changes

The existing `fetch-pois.mjs` `buildOverpassQuery` uses `out center tags`. This
script adds a **separate** query using `out geom tags` only for the polygon
backfill — it does not change `fetch-pois.mjs`. This is intentional: the main
fetch pipeline continues to emit centroid points into `candidates.json`; the
separate backfill script adds polygon geometry on top of the committed curated
datasets.

Future consideration (not in this PR): if `fetch-pois.mjs` itself were changed
to emit `out geom` for park/golf rows, new locations would arrive with polygon
data at fetch time. The design is compatible with this — `toLocation()` would
just optionally populate `polygon`. Left for a follow-up.

---

## 5. UI changes — `MapGuess.tsx`

A new `polygonLayerRef` is added alongside `truthMarkerRef` and `lineRef`. The
stub already declares it; the TODO comment in the stub marks exactly where
creation goes.

### 5.1 Cleanup (already in stub)

At the top of the reveal useEffect (before `if (!reveal) return`):
```ts
polygonLayerRef.current?.remove()
polygonLayerRef.current = null
```
This mirrors the existing `truthMarkerRef` / `lineRef` cleanup and runs on
every dependency change (including `reveal` becoming null at round reset).
No cross-round layer leak is possible.

### 5.2 Creation (TODO [M-D1])

After creating `truthMarkerRef.current`, and BEFORE building the `fitBounds`
call, add:
```ts
if (reveal.location.polygon?.length) {
  polygonLayerRef.current = L.polygon(
    reveal.location.polygon as L.LatLngExpression[],
    {
      color: '#2ecc71',      // same green as truth marker
      weight: 2,
      fillColor: '#2ecc71',
      fillOpacity: 0.15,     // subtle fill; satellite imagery stays visible
    },
  ).addTo(map)
}
```

### 5.3 `fitBounds` — featureGroup approach (TODO [M-D1])

The current `L.latLngBounds(guess, truth).pad(0.4)` only frames the guess↔truth
line. When the polygon extends beyond that bounding box (e.g. a large park), the
polygon is clipped. Replace with a `L.featureGroup` that collects ALL present
layers, then call `getBounds()`:

```ts
const revealLayers: L.Layer[] = [truthMarkerRef.current!]
if (lineRef.current) revealLayers.push(lineRef.current)
if (polygonLayerRef.current) revealLayers.push(polygonLayerRef.current)
map.fitBounds(
  L.featureGroup(revealLayers).getBounds().pad(0.2),
  { maxZoom: 17 },
)
```

This replaces the existing `L.latLngBounds(...).pad(0.4)` call inside the
`if (guess)` block. The `else` branch (`map.setView(truth, 15)`) should
similarly be replaced by a featureGroup that includes the polygon if present,
so a no-guess reveal also frames the polygon.

**Why `pad(0.2)` not `pad(0.4)`:** featureGroup bounds already include the
polygon outline, so less padding is needed. The 0.4 was compensating for a
tight guess↔truth box; the polygon itself provides natural framing.

---

## 6. Milestones and tasks (TDD order)

Tasks within the same milestone that have no dependency on each other can run in parallel.

### M-A: Types and geometry (parallel: A1 + A2)

**A1 — `src/types.ts` polygon field** (no dependencies)
- Add `polygon?: [number, number][]` to `Location`.
- Add a JSDoc comment explaining the open-ring convention and 5-dp precision.
- No test needed: schema is guarded by the dataset guard test once data exists.

**A2 — `src/lib/geo.ts` + `src/lib/geo.test.ts`** (no dependencies)
- Write `geo.test.ts` first (RED).
- Implement stubs → make pass (GREEN).
- See §6.1 for the complete test-case list.

### M-B: Scoring update (depends on A2)

**B1 — `src/lib/scoring.ts` constant rename + `scoreGuess` polygon branch**
- Update `scoring.test.ts` first: change tests for `PERFECT_RADIUS_M` to use
  the new value; add polygon-branch tests for `scoreGuess`.
- Make stubs → make pass.

### M-C: Backfill script (depends on A1 for the output schema)

**C1 — `scripts/add-polygons.mjs`**
- Implement the name+proximity match, Douglas–Peucker, node-cap logic.
- Dry-run against stpete first; inspect 5–10 polygons in overpass-turbo before
  committing data.
- Run for all 5 cities; commit updated JSONs.

### M-D: UI (depends on A1; NOT parallel with A — must wait for A1)

**D1 — `src/components/MapGuess.tsx` polygon layer**

Dependency: D1 requires A1 (`polygon?` field must be compiled into `Location`
before `MapGuess.tsx` can reference `reveal.location.polygon`). D1 CAN run in
parallel with M-B and M-C once A1 is merged, but NOT before A1.

- `polygonLayerRef` ref is already declared in the stub.
- Implement polygon creation + featureGroup `fitBounds` per §5.2 and §5.3.
- Manual test: open the game, reveal a park location, verify the polygon appears,
  the view frames it, and it is cleaned up on next round start.

### M-E: Docs (same PR — CLAUDE.md requirement)

**E1 — `docs/DATA-SOURCING.md`**
- Update the Location schema block to include `polygon?`.
- Add a section on the `add-polygons.mjs` backfill and the `out geom` approach.

**E2 — `docs/PLAN.md` §5.4 Scoring**
- Update the scoring section with the new point radius constant and the polygon
  branch description.
- Add `src/lib/geo.ts` to the architecture overview in §2.

---

### 6.1 Complete test-case list for `src/lib/geo.test.ts`

#### `pointInPolygon`

The ring used in most tests is a unit square at St. Pete coordinates:
```
ring = [[27.77, -82.64], [27.77, -82.63], [27.76, -82.63], [27.76, -82.64]]
// (open ring — first point not repeated)
```

| Test | Input point | Expected | Notes |
|------|-------------|----------|-------|
| Interior point | [27.765, -82.635] | `true` | centroid of square |
| Corner point (vertex) | [27.77, -82.64] | `true` | boundary = inside |
| Point on edge | [27.765, -82.64] | `true` | boundary = inside |
| Point outside (north) | [27.78, -82.635] | `false` | past north edge |
| Point outside (east) | [27.765, -82.62] | `false` | past east edge |
| Point outside (SW) | [27.75, -82.65] | `false` | diagonal outside |
| Concave ring (L-shape): outside the notch | [27.77x, -82.63x] | `false` | tests concavity |
| Identical point list (degenerate ring, 1 point) | any | `false` | guard against empty ring |
| Ring with 2 points (degenerate) | any | `false` | no enclosed area |
| Seattle latitude test (higher lat) | interior | `true` | tests no lat-dependency in ray-cast |

#### `distanceToPolygonMeters`

| Test | Input | Expected | Notes |
|------|-------|----------|-------|
| Point at centroid (inside) | [27.765, -82.635] | `0` | inside = 0 |
| Point at vertex (inside by boundary rule) | [27.77, -82.64] | `0` | boundary = 0 |
| Point 200m outside (north) | computed from ring | `≈ 200` (±5m) | tests north edge segment |
| Point 500m outside (east) | computed from ring | `≈ 500` (±10m) | tests east edge segment |
| Point outside at corner angle (nearest is vertex) | 45° diagonal from NW corner | `≈ haversine to that corner` (±1%) | nearest point is the vertex, not a segment interior |
| Large park ring (Boyd Hill, ~500m radius) | pin 100m outside | `≈ 100` (±5m) | real-world scale test |
| Points further away | 1km, 2km, 5km outside | monotonically increasing | no plateau |

#### `douglasPeucker`

| Test | Input | Expected |
|------|-------|----------|
| Collinear points | 5 collinear points | reduces to 2 endpoints |
| Zigzag points (large deviation) | retained | all kept |
| ε = 0 | ring of n points | all n points returned |
| ε very large | ring of n points | 2 endpoints only |
| Open ring in, open ring out | input has n points | output has ≤ n points, still open |

#### `scoreGuess` — four-branch test cases (add to `scoring.test.ts` [M-B1])

The exact cases from §3.4, expressed as a table for `scoring.test.ts` authors:

| Branch | Location type | Polygon | Distance | Expected score |
|--------|--------------|---------|----------|---------------|
| 1 — polygon inside | park | set, non-empty | guess inside | `MAX_ROUND_SCORE`; `distanceMeters: 0` |
| 2 — polygon outside 1m | park | set, non-empty | 1m from edge | `< MAX_ROUND_SCORE` (perfectRadius=0) |
| 2 — polygon outside 500m | park | set, non-empty | 500m from edge | same as `scoreForDistance(500, 0)` |
| 3 — large-footprint no polygon at 250m | park | absent | 250m to centroid | `MAX_ROUND_SCORE` (LARGE_FALLBACK=300) |
| 3 — large-footprint no polygon at 301m | park | absent | 301m to centroid | `< MAX_ROUND_SCORE` |
| 3 — golf_course no polygon at 250m | golf_course | absent | 250m to centroid | `MAX_ROUND_SCORE` |
| 4 — normal point at 100m | restaurant | absent | 100m to centroid | `MAX_ROUND_SCORE` |
| 4 — normal point at 131m | restaurant | absent | 131m to centroid | `< MAX_ROUND_SCORE` |
| 4 — normal point at 0m | landmark | absent | 0m | `MAX_ROUND_SCORE`; `distanceMeters: 0` |

---

## 7. Pre-empted reviewer concerns

### 7.1 No OSM id on existing rows (biggest risk)

**Problem:** Current `Location` rows have no `osmId` field. The backfill script
cannot issue a direct `way(<id>)` or `relation(<id>)` query. It must match by
name + bbox proximity.

**Mitigation:**
1. The city bounding box is tight (0.25°–0.5° boxes). A name collision within
   one box is rare.
2. The 500m centroid proximity filter eliminates most false matches.
3. For the remaining ambiguous cases (two parks named "Central Park" within 500m
   of each other in a city), the script takes the closer one and logs a `WARN`
   line with the location id and both candidate OSM way ids for manual review.
4. Results are written to a dry-run report before any file is modified.

**Residual risk:** a name in the dataset has been human-edited (e.g. "St. Pete
Pier" in the dataset vs. "The St. Pete Pier" in OSM). The script will miss these
and leave `polygon` unset. The location silently falls back to point scoring —
no runtime error, but no polygon either. The dry-run output lists all
unmatched locations; they can be hand-corrected by adding a `nameOverride` map
in the script (a simple JS object at the top of the file: `{ 'id': 'OSM name' }`).

**Future hardening:** when new park/golf locations are added via `fetch-pois.mjs`
or `add-location` skill, store the OSM element id (`el.id`, `el.type`) on the
row. This makes future re-fetches exact and eliminates the matching risk
entirely. Tracked in BACKLOG.md.

### 7.2 Multipolygons and holes

A park mapped as a multipolygon relation may have an outer ring (the park) and
inner rings (lakes, buildings). In v1, only the **first outer member** of the
relation's geometry is used. The inner rings are ignored.

Practical impact: if a player places their pin inside a lake within a park, the
polygon hit test says "inside the park" → scores 100. This is the **correct**
game behaviour — the player correctly identified the park, even if they clicked
on a lake inside it.

**Multi-arc outer ring:** some parks' outer boundary is assembled from several
way segments (arcs) that must be stitched head-to-tail. v1 does NOT implement
stitching. If the first outer member's geometry array is not a closed ring (last
node ≠ first node), `extractOuterRing` returns null and logs:
> `WARN [add-polygons] <id>: OSM element matched but outer ring is multi-arc (not stitched, v1 skip)`

This is DISTINCT from:
> `WARN [add-polygons] <id>: OSM element has no outer member geometry`
> `WARN [add-polygons] <id>: no OSM match found (name not in bbox or centroid too far)`

These three log levels allow operators to triage: "v1 stitching limitation" vs.
"unexpected OSM data shape" vs. "location simply absent from OSM". The
multi-arc case is a known v1 scope exclusion; a v2 stitching pass can be
targeted at exactly those IDs. Tracked in BACKLOG.md.

### 7.3 Self-touching/huge relations (bundle bloat)

A `leisure:nature_reserve` or county park relation can have thousands of nodes.
The 100-node post-simplification cap handles this: such elements are simply
dropped with a warning and left as point locations. They are rare in our city
bboxes (these are city-level datasets, not county-level).

Douglas–Peucker at ε = 0.00005° (≈ 5m) reduces a typical 200-node park outline
to 25–40 nodes. A 500-node park outline reduces to 40–70. Only truly complex
coastlines stay above 100 after simplification.

**No regression for dropped polygons:** a park/golf_course location that falls
back to point scoring because its polygon was dropped by the 100-node cap uses
`LARGE_FALLBACK_RADIUS_M = 300` in `scoreGuess` branch 3 (see §3.4). The
player is not penalised by the tighter `POINT_PERFECT_RADIUS_M = 100` that
applies to ordinary non-park locations. (Resolved: SF-7 / MF-1.)

### 7.4 Antimeridian

Irrelevant for all 5 cities (continental US). Not handled. A comment in `geo.ts`
notes this assumption.

### 7.5 Bundle size regression

Chicago.json is 1.3 MB today. The 45 in-play park/golf polygons add an estimated
**~35 KB** (45 × 40 nodes × 20 bytes/coord). The file goes to ~1.34 MB.
Vite's build gzip-compresses JSON; coordinate-heavy data compresses very well
(coordinates are repetitive and predictable). The gzip delta is likely under
10 KB. This is not a regression worth special treatment.

The 100-node cap and Douglas–Peucker simplification are the primary safeguards.
We also round coordinates to 5 decimal places (`toFixed(5)`) rather than the 7
Overpass emits — this saves 2 characters per coordinate pair and avoids
false-precision noise.

### 7.6 `distanceMeters` for a polygon hit

Returns **0**. The UI shows "0 m" — which is accurate ("you were inside the
polygon"). The `formatDistance` function already handles 0: `formatDistance(0)`
returns `'0 m'`. No UI change needed; the share string emoji tier uses score not
distance, so 0 m / 100 score produces 🟩 correctly.

### 7.7 Existing scoring tests break on radius change

`scoring.test.ts` currently asserts:
```ts
expect(scoreForDistance(0)).toBe(MAX_ROUND_SCORE)              // still passes
expect(scoreForDistance(PERFECT_RADIUS_M)).toBe(MAX_ROUND_SCORE)  // still passes
```

Both continue to pass because:
- `PERFECT_RADIUS_M` is kept at 300 (value unchanged; marked deprecated).
- `scoreForDistance` now takes `perfectRadiusM` as a second parameter with
  default 300. A call `scoreForDistance(300)` (no second arg) is identical to
  `scoreForDistance(300, 300)` → still returns `MAX_ROUND_SCORE`.

No existing `scoreForDistance` test breaks.

**New `scoreGuess` test cases to add in `scoring.test.ts` [M-B1]** (spec'd
in §3.4 — repeating here for traceability):
- point-normal at 100m → `MAX_ROUND_SCORE`; at 131m → `< MAX_ROUND_SCORE`.
- point-large-no-polygon (park) at 250m → `MAX_ROUND_SCORE` (LARGE_FALLBACK=300 covers it);
  at 301m → `< MAX_ROUND_SCORE`.
- polygon-outside at 1m → `< MAX_ROUND_SCORE` (perfectRadius = 0, no freebie).
- polygon-inside → `{ distanceMeters: 0, score: MAX_ROUND_SCORE }`.

This also confirms SF-7 is resolved: large parks with no polygon regress to
`LARGE_FALLBACK_RADIUS_M = 300`, NOT to the tighter 100m. (Resolved: MF-1.)

### 7.8 Leaflet polygon layer leak

The reveal useEffect already removes `truthMarkerRef.current` and
`lineRef.current` at its top before the `if (!reveal) return` guard. The new
`polygonLayerRef.current` follows the exact same pattern:
```ts
polygonLayerRef.current?.remove()
polygonLayerRef.current = null
```
This fires on every dependency change (including `reveal` becoming null when a
new round starts), so the polygon is always cleaned up. The `polygonLayerRef` is
declared with `useRef<L.Polygon | null>(null)` immediately after `lineRef`.

### 7.9 MIN_NON_FOOD_PER_DAY / daily selection

`daily.ts` is **not touched** by this change. `selectDailyLocations` operates on
the same `Location[]` it always did. The new optional `polygon` field is
transparent to daily selection. No action required.

### 7.10 Backwards compatibility

`polygon` is optional on `Location`. Old persisted game states (in
`localStorage`) use `Location` objects from the bundled JSON. If an old game
state (from before this feature) is loaded, its locations have no `polygon`
field. `scoreGuess` checks `location.polygon?.length > 0` before taking the
polygon branch — absent or empty polygon falls through to point scoring.
`STORAGE_VERSION` does NOT need to be bumped; no new required fields.

---

## 8. Open questions for the owner

1. **`venue` category in v1 polygon scope?** — **RESOLVED: deferred to v2.**
   v1 scope is `park` and `golf_course` only. The 112 venue locations mix
   theaters and stadiums; a category-level polygon assignment would be wrong
   without checking OSM element type (stadium vs. venue). Stadium polygon
   support (Tropicana Field, Beaver Stadium, Michigan Stadium) is tracked in
   BACKLOG.md as a v2 item.

2. **Point radius: 100m justified?** — **RESOLVED: `POINT_PERFECT_RADIUS_M = 100`
   is the accepted default.** (Planning briefly settled on 130m; tightened
   further to 100m — "roughly a city block" — during implementation. This doc
   was reconciled to the shipped value.) Owner will playtest after launch; the
   constant is easy to adjust (one line in `scoring.ts`) and
   `LARGE_FALLBACK_RADIUS_M = 300` protects large parks with no polygon from the
   tighter radius.

3. **Polygon data committed vs. fetched at build time?** — **RESOLVED: committed
   into JSON.** Same pipeline as all other location data. Keeps CI offline-able
   and is consistent. Confirmed correct call.

4. **`marina` and `nature_reserve` categories?** — **RESOLVED: included
   automatically** via `category: 'park'` on their location rows. No action
   needed. They ride along in v1.

5. **Cemetery category?** — Open. No cemeteries in the current datasets (not
   in the `LocationCategory` enum). If added in future, they need their own
   category + Overpass query addition + fame pass — a separate PR. Tracked in
   BACKLOG.md.

---

## 9. Doc-update checklist (same PR)

- [x] `src/types.ts`: `polygon?` field with JSDoc — DONE (stub).
- [x] `src/types.ts`: `RoundResult.distanceMeters` JSDoc updated to describe all
      three semantics (point centroid / polygon inside = 0 / polygon outside =
      edge distance) — DONE (stub). (Resolved: Nit N-B.)
- [x] `docs/DATA-SOURCING.md` §3: add `polygon?` to the Location schema block — DONE.
- [x] `docs/DATA-SOURCING.md`: new §4d "Polygon backfill (`add-polygons.mjs`)"
      covering the `out geom` approach, matching strategy, Douglas–Peucker, node cap,
      and the three distinct WARN log messages (§7.2) — DONE.
- [x] `docs/PLAN.md` §2: add `src/lib/geo.ts` to architecture overview — DONE.
- [x] `docs/PLAN.md` §5.4: update Scoring section with `POINT_PERFECT_RADIUS_M`,
      `LARGE_FALLBACK_RADIUS_M`, all four `scoreGuess` branches, and
      `distanceMeters` semantics — DONE.
- [x] `docs/PLAN.md` repo structure: add `scripts/add-polygons.mjs` entry — DONE.
- [x] `README.md`: add `npm run add-polygons` command description — DONE.

---

## 10. Files created/changed summary

| File | Action | Milestone |
|------|--------|-----------|
| `src/types.ts` | Add `polygon?` to `Location` | A1 |
| `src/lib/geo.ts` | New file: `pointInPolygon`, `distanceToPolygonMeters`, `douglasPeucker` | A2 |
| `src/lib/geo.test.ts` | New file: full test suite for geo.ts | A2 (RED first) |
| `src/lib/scoring.ts` | Add `POINT_PERFECT_RADIUS_M`, update `scoreGuess` | B1 |
| `src/lib/scoring.test.ts` | Update for new constant, add polygon branch tests | B1 (RED first) |
| `scripts/add-polygons.mjs` | New script: backfill polygon data from Overpass | C1 |
| `src/components/MapGuess.tsx` | Add `polygonLayerRef`, render polygon on reveal | D1 |
| `public/locations.stpete.json` | Polygon data added for park/golf rows | C1 |
| `public/locations.statecollege.json` | Polygon data added for park/golf rows | C1 |
| `public/locations.annarbor.json` | Polygon data added for park/golf rows | C1 |
| `public/locations.seattle.json` | Polygon data added for park/golf rows | C1 |
| `public/locations.chicago.json` | Polygon data added for park/golf rows | C1 |
| `docs/DATA-SOURCING.md` | Schema update + new §4d | E1 |
| `docs/PLAN.md` | Scoring section + geo.ts in architecture | E2 |
| `docs/plans/POLYGON-SCORING.md` | This file | — |
