/**
 * Pure geometry utilities for polygon-aware scoring.
 *
 * All functions operate on lat/lng coordinates directly. Planar ray-casting is
 * used for point-in-polygon (see notes below). An equirectangular local
 * projection is used for point-to-segment distance (error < 0.01% at city
 * scale — see docs/plans/POLYGON-SCORING.md §3.3).
 *
 * ASSUMPTIONS (documented, not defended):
 *  - All coordinates are in the continental United States. Antimeridian (±180°)
 *    handling is NOT implemented and not needed.
 *  - Polygons are single-ring (outer only). Holes / multipolygons are scoped
 *    to a future follow-up (see docs/plans/POLYGON-SCORING.md §7.4).
 *
 * [M-A2]
 */

/** A coordinate pair stored as [lat, lng]. */
export type LatLng = [number, number]

/**
 * An open polygon ring: a sequence of [lat, lng] pairs where the first point
 * is NOT repeated at the end. All functions in this module normalise on the
 * open-ring convention internally.
 */
export type Ring = LatLng[]

/**
 * Ray-casting point-in-polygon test for a single ring.
 *
 * ALGORITHM (implementer must follow this exactly to pass the boundary tests):
 *
 * Step 1 — Explicit boundary check (run BEFORE ray-casting):
 *   For every edge (vertices[i] → vertices[j]), test whether `point` lies on
 *   the segment within a small epsilon (e.g. 1e-10 degrees). If yes, return
 *   true immediately. This correctly handles both vertex hits (where ray-casting
 *   would double-count the vertex and produce a wrong parity) and edge hits
 *   (where floating-point parity is unpredictable).
 *
 * Step 2 — Ray-casting for interior points:
 *   Cast a horizontal ray from `point` to +∞ on the lng axis. Count edge
 *   crossings using the standard half-open rule to avoid vertex double-counting:
 *   count edge (i→j) only if `(yi > py) !== (yj > py)`. Odd count → inside.
 *   (Vertices that hit the ray are counted by at most one of the two edges they
 *   belong to, so the parity is correct for interior points once the boundary
 *   check in Step 1 has already handled the on-edge/on-vertex cases.)
 *
 * Planar ray-casting on raw lat/lng is topologically correct at city scale
 * because the cos(lat) distortion is uniform across the small city bounding
 * box (0.25°–0.5°), preserving crossing parity. All our cities are
 * continental US, far from the antimeridian — no ±180° handling needed.
 *
 * @param _point - The query point [lat, lng].
 * @param _ring  - Open polygon ring [[lat, lng], ...]. Degenerate rings
 *               (< 3 points) always return false.
 * @returns true if the point is inside or on the boundary of the ring.
 *
 * [M-A2]
 */
export function pointInPolygon(point: LatLng, ring: Ring): boolean {
  // Degenerate rings enclose no area.
  if (ring.length < 3) return false

  const [py, px] = point // py = lat, px = lng

  // Step 1 — explicit boundary check (handles vertices and on-edge points that
  // ray-casting cannot classify reliably).
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (
      distancePointToSegmentDeg(point, ring[j], ring[i]) <= ON_EDGE_EPSILON_DEG
    ) {
      return true
    }
  }

  // Step 2 — half-open ray-cast (horizontal ray to +∞ on the lng axis).
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]
    const xi = ring[i][1]
    const yj = ring[j][0]
    const xj = ring[j][1]
    if (yi > py !== yj > py) {
      const xCross = ((xj - xi) * (py - yi)) / (yj - yi) + xi
      if (px < xCross) inside = !inside
    }
  }
  return inside
}

/**
 * Minimum distance in metres from a point to the nearest edge of a ring.
 *
 * Returns 0 if `pointInPolygon(point, ring)` is true (inside or on boundary).
 *
 * Algorithm (per docs/plans/POLYGON-SCORING.md §3.3):
 *  1. Project ring vertices and query point into a local equirectangular space:
 *       x = lng * cos(refLat_rad),  y = lat
 *     where refLat is the mean latitude of the ring's vertices.
 *  2. For each edge, find the nearest point on the segment (parametric t ∈ [0,1]).
 *  3. Track the globally nearest candidate point.
 *  4. Convert that point back to [lat, lng] and return haversineMeters(point, nearest).
 *
 * Error bound: < 0.01% for polygons ≤ 5 km in diameter at latitudes 27°–48°N.
 *
 * @param _point - The query point [lat, lng].
 * @param _ring  - Open polygon ring. Degenerate rings (< 3 points) return
 *               haversineMeters to the single vertex (or Infinity for empty).
 * @returns Distance in metres. 0 when the point is inside or on the boundary.
 *
 * [M-A2]
 */
export function distanceToPolygonMeters(point: LatLng, ring: Ring): number {
  if (ring.length === 0) return Infinity
  if (ring.length === 1) {
    return haversineMeters(
      { lat: point[0], lng: point[1] },
      { lat: ring[0][0], lng: ring[0][1] },
    )
  }
  // Inside or on the boundary → zero distance.
  if (pointInPolygon(point, ring)) return 0

  // Local equirectangular projection (undistorts the lng axis) so that
  // "nearest point on a segment" is a planar computation. refLat = mean latitude.
  const refLat = ring.reduce((sum, [lat]) => sum + lat, 0) / ring.length
  const cosRef = Math.cos((refLat * Math.PI) / 180)
  const projX = (lng: number) => lng * cosRef
  const proj = (c: LatLng): [number, number] => [c[0], projX(c[1])] // [y=lat, x]

  const [py, pxRaw] = point
  const px = projX(pxRaw)

  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ay, ax] = proj(ring[j])
    const [by, bx] = proj(ring[i])
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = 0
    if (lenSq > 0) {
      t = ((px - ax) * dx + (py - ay) * dy) / lenSq
      t = Math.max(0, Math.min(1, t))
    }
    const nearestX = ax + t * dx
    const nearestY = ay + t * dy
    // Convert the projected nearest point back to geographic coords.
    const nearest = { lat: nearestY, lng: nearestX / cosRef }
    const d = haversineMeters({ lat: py, lng: pxRaw }, nearest)
    if (d < best) best = d
  }
  return best
}

/**
 * Douglas–Peucker polyline simplification.
 *
 * Reduces the number of points in `ring` while preserving shape to within
 * `epsilonDeg` degrees. Input and output are both open rings.
 *
 * Used at data-prep time only (the `npm run add-polygons` flow) — NOT called at
 * game runtime. `scripts/add-polygons.mjs` keeps its own parallel copy (it can't
 * import this TS module directly); this export is the unit-tested reference
 * implementation (see `geo.test.ts`).
 *
 * @param _ring       - Open polygon ring to simplify.
 * @param _epsilonDeg - Maximum perpendicular deviation allowed (in degrees).
 *                     Use 0.00005 (≈ 5 m) for city-scale polygon storage.
 * @returns Simplified open ring. Always retains at least the first and last
 *          points of the input. Returns the input unchanged for rings ≤ 2 points.
 *
 * [M-A2 / C1]
 */
export function douglasPeucker(ring: Ring, epsilonDeg: number): Ring {
  if (ring.length <= 2) return [...ring]

  // Treat the open ring as a polyline from first → last vertex. The first and
  // last points are always retained.
  const keep = new Array<boolean>(ring.length).fill(false)
  keep[0] = true
  keep[ring.length - 1] = true

  const stack: Array<[number, number]> = [[0, ring.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDist = -1
    let maxIdx = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceDeg(ring[i], ring[start], ring[end])
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
// Exported utility — also used internally by distanceToPolygonMeters
// ---------------------------------------------------------------------------

/**
 * Haversine great-circle distance between two lat/lng points, in metres.
 *
 * Exported so that `geo.test.ts` can test it directly and so that
 * `scoring.ts` can import it (making geo.ts the single app-side owner of this
 * function). The `.mjs` backfill script keeps its own copy because plain Node
 * scripts cannot import TypeScript sources — that duplication is accepted and
 * noted in docs/plans/POLYGON-SCORING.md §N2.
 *
 * Earth radius: 6,371,000 m.
 *
 * [M-A2]
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000

/**
 * A point within this many degrees of a ring edge counts as "on the boundary"
 * (treated as inside). ~1e-9° ≈ 0.1 mm — tight enough that only genuine
 * on-edge/vertex hits qualify, loose enough to absorb float rounding.
 */
const ON_EDGE_EPSILON_DEG = 1e-9

/**
 * Planar distance (in degrees) from point P to segment A→B, treating lat/lng as
 * raw planar coords. Used only for the on-boundary classification in
 * pointInPolygon — not a metric distance.
 */
function distancePointToSegmentDeg(p: LatLng, a: LatLng, b: LatLng): number {
  const ax = a[1]
  const ay = a[0]
  const bx = b[1]
  const by = b[0]
  const px = p[1]
  const py = p[0]
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = 0
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
  }
  const nx = ax + t * dx
  const ny = ay + t * dy
  return Math.hypot(px - nx, py - ny)
}

/**
 * Perpendicular distance (in degrees) from point P to the infinite line through
 * A and B. Used by douglasPeucker. Falls back to point distance when A == B.
 */
function perpendicularDistanceDeg(p: LatLng, a: LatLng, b: LatLng): number {
  const ax = a[1]
  const ay = a[0]
  const bx = b[1]
  const by = b[0]
  const px = p[1]
  const py = p[0]
  const dx = bx - ax
  const dy = by - ay
  const mag = Math.hypot(dx, dy)
  if (mag === 0) return Math.hypot(px - ax, py - ay)
  return Math.abs(dx * (ay - py) - (ax - px) * dy) / mag
}
