/**
 * Tests for src/lib/geo.ts — pointInPolygon, distanceToPolygonMeters,
 * douglasPeucker, haversineMeters.
 *
 * Write these tests FIRST (RED), then implement geo.ts (GREEN).
 * See docs/plans/POLYGON-SCORING.md §6.1 for the full test-case rationale.
 *
 * [M-A2]
 */

import { describe, it, expect } from 'vitest'
import {
  pointInPolygon,
  distanceToPolygonMeters,
  douglasPeucker,
  haversineMeters,
} from './geo'
import type { LatLng, Ring } from './geo'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * A unit square ring at St. Pete coordinates (open — first point not repeated).
 * Approx 1.1 km × 1.1 km.
 *
 *   NW [27.77, -82.64] --- NE [27.77, -82.63]
 *        |                           |
 *   SW [27.76, -82.64] --- SE [27.76, -82.63]
 */
const SQUARE: Ring = [
  [27.77, -82.64], // NW
  [27.77, -82.63], // NE
  [27.76, -82.63], // SE
  [27.76, -82.64], // SW
]

/**
 * A concave ring: a rectangle with the bottom-right corner cut out (an L lying
 * on its back). Walking the vertices:
 *
 *   A(27.77,-82.64) ───────────────── B(27.77,-82.63)   ← full-width top band
 *        │                                   │
 *        │                            C(27.765,-82.63)
 *        │                                   │  ← notch cut in here
 *        │                  D(27.765,-82.635)─┘
 *        │                       │
 *   F(27.76,-82.64) ── E(27.76,-82.635)
 *
 * The NOTCH (cut-out, OUTSIDE the ring) is the bottom-right rectangle:
 * lat 27.76–27.765, lng -82.635 to -82.63. The top band (lat 27.765–27.77)
 * spans the FULL width, so points up there are inside.
 */
const L_SHAPE: Ring = [
  [27.77, -82.64],
  [27.77, -82.63],
  [27.765, -82.63], // <-- notch inward here
  [27.765, -82.635],
  [27.76, -82.635],
  [27.76, -82.64],
]

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    expect(
      haversineMeters({ lat: 27.77, lng: -82.63 }, { lat: 27.77, lng: -82.63 }),
    ).toBeCloseTo(0, 5)
  })

  it('one degree of latitude ≈ 111 km', () => {
    const d = haversineMeters({ lat: 27, lng: -82 }, { lat: 28, lng: -82 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })

  it('is symmetric', () => {
    const a = { lat: 27.77, lng: -82.64 }
    const b = { lat: 27.76, lng: -82.63 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 3)
  })
})

// ---------------------------------------------------------------------------
// pointInPolygon
// ---------------------------------------------------------------------------

describe('pointInPolygon', () => {
  describe('unit square', () => {
    it('centroid is inside', () => {
      const centroid: LatLng = [27.765, -82.635]
      expect(pointInPolygon(centroid, SQUARE)).toBe(true)
    })

    it('NW corner vertex is inside (boundary = inclusive)', () => {
      expect(pointInPolygon([27.77, -82.64], SQUARE)).toBe(true)
    })

    it('midpoint of west edge is inside (boundary = inclusive)', () => {
      // Midpoint of SW→NW edge
      expect(pointInPolygon([27.765, -82.64], SQUARE)).toBe(true)
    })

    it('point north of the ring is outside', () => {
      expect(pointInPolygon([27.78, -82.635], SQUARE)).toBe(false)
    })

    it('point east of the ring is outside', () => {
      expect(pointInPolygon([27.765, -82.62], SQUARE)).toBe(false)
    })

    it('point SW diagonal outside is outside', () => {
      expect(pointInPolygon([27.75, -82.65], SQUARE)).toBe(false)
    })

    it('point at ring centre with different lat (Seattle) is inside comparable ring', () => {
      // Validate no lat-dependency bug: same relative position, higher latitude
      const seattleRing: Ring = [
        [47.61, -122.34],
        [47.61, -122.33],
        [47.6, -122.33],
        [47.6, -122.34],
      ]
      expect(pointInPolygon([47.605, -122.335], seattleRing)).toBe(true)
    })
  })

  describe('concave (L-shape)', () => {
    it('point inside the main body is inside', () => {
      // South portion of the L
      expect(pointInPolygon([27.762, -82.637], L_SHAPE)).toBe(true)
    })

    it('point in the notch region is outside', () => {
      // In the bottom-right notch: lat 27.762 (between 27.76 and 27.765),
      // lng -82.632 (east of the -82.635 cut). This is the cut-out corner.
      expect(pointInPolygon([27.762, -82.632], L_SHAPE)).toBe(false)
    })

    it('point in the full-width top band is inside', () => {
      // lat 27.768 is above the notch, where the ring spans the full width.
      expect(pointInPolygon([27.768, -82.632], L_SHAPE)).toBe(true)
    })
  })

  describe('degenerate rings', () => {
    it('empty ring returns false', () => {
      expect(pointInPolygon([27.77, -82.64], [])).toBe(false)
    })

    it('single-point ring returns false', () => {
      expect(pointInPolygon([27.77, -82.64], [[27.77, -82.64]])).toBe(false)
    })

    it('two-point ring returns false', () => {
      expect(
        pointInPolygon(
          [27.77, -82.64],
          [
            [27.77, -82.64],
            [27.76, -82.63],
          ],
        ),
      ).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// distanceToPolygonMeters
// ---------------------------------------------------------------------------

describe('distanceToPolygonMeters', () => {
  it('returns 0 for a point inside the ring', () => {
    expect(distanceToPolygonMeters([27.765, -82.635], SQUARE)).toBe(0)
  })

  it('returns 0 for a vertex (boundary)', () => {
    expect(distanceToPolygonMeters([27.77, -82.64], SQUARE)).toBe(0)
  })

  it('returns ~0 for a point exactly on an edge', () => {
    // Midpoint of west edge (lat 27.765, lng -82.64)
    expect(distanceToPolygonMeters([27.765, -82.64], SQUARE)).toBeCloseTo(0, 1)
  })

  it('returns positive distance for a point outside', () => {
    // Point directly north of the ring — distance to north edge
    const d = distanceToPolygonMeters([27.78, -82.635], SQUARE)
    expect(d).toBeGreaterThan(0)
    // 0.01° lat ≈ 1110 m at these latitudes
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1300)
  })

  it('distance increases monotonically as the point moves further away', () => {
    // Points directly north, increasing distance
    const d1 = distanceToPolygonMeters([27.78, -82.635], SQUARE)
    const d2 = distanceToPolygonMeters([27.79, -82.635], SQUARE)
    const d3 = distanceToPolygonMeters([27.8, -82.635], SQUARE)
    expect(d1).toBeLessThan(d2)
    expect(d2).toBeLessThan(d3)
  })

  it('returns distance to nearest vertex for a point diagonal to a corner', () => {
    // Point directly NW of the NW corner — nearest point is the NW vertex
    const nwCorner: LatLng = [27.77, -82.64]
    const outsideNW: LatLng = [27.775, -82.645]
    const dToPolygon = distanceToPolygonMeters(outsideNW, SQUARE)
    const dToCorner = haversineMeters(
      { lat: outsideNW[0], lng: outsideNW[1] },
      { lat: nwCorner[0], lng: nwCorner[1] },
    )
    // Should be within 1% of true haversine distance to corner
    expect(dToPolygon).toBeCloseTo(dToCorner, -1) // within ~10m
  })

  it('returns Infinity (or very large) for empty ring', () => {
    const d = distanceToPolygonMeters([27.77, -82.64], [])
    expect(d).toBe(Infinity)
  })

  describe('real-world scale', () => {
    /**
     * Boyd Hill Nature Preserve, St. Pete: lat 27.7334, lng -82.6578.
     * Approximate bbox: 0.015° × 0.015° ≈ 1.7 km × 1.4 km.
     * Tiny proxy ring (not actual OSM data — just a bounding box approximation).
     */
    const BOYD_HILL_APPROX: Ring = [
      [27.741, -82.665],
      [27.741, -82.65],
      [27.726, -82.65],
      [27.726, -82.665],
    ]

    it('centroid of Boyd Hill is inside', () => {
      expect(pointInPolygon([27.7334, -82.6578], BOYD_HILL_APPROX)).toBe(true)
    })

    it('pin 200m outside north edge returns ~200m', () => {
      // North edge is at lat 27.741. 200m ≈ 0.0018° lat.
      const outside: LatLng = [27.743, -82.657]
      const d = distanceToPolygonMeters(outside, BOYD_HILL_APPROX)
      // Expect roughly 200m ± 30m
      expect(d).toBeGreaterThan(150)
      expect(d).toBeLessThan(250)
    })
  })
})

// ---------------------------------------------------------------------------
// douglasPeucker
// ---------------------------------------------------------------------------

describe('douglasPeucker', () => {
  it('collinear points simplify to just the two endpoints', () => {
    const collinear: Ring = [
      [27.76, -82.64],
      [27.762, -82.64],
      [27.764, -82.64],
      [27.766, -82.64],
      [27.768, -82.64],
    ]
    const simplified = douglasPeucker(collinear, 0.00005)
    expect(simplified).toHaveLength(2)
    expect(simplified[0]).toEqual([27.76, -82.64])
    expect(simplified[simplified.length - 1]).toEqual([27.768, -82.64])
  })

  it('retains all points when epsilon is 0', () => {
    const result = douglasPeucker(SQUARE, 0)
    expect(result).toHaveLength(SQUARE.length)
  })

  it('retains only endpoints when epsilon is very large', () => {
    const result = douglasPeucker(SQUARE, 100)
    expect(result).toHaveLength(2)
  })

  it('does not simplify when all points are significant zigzags', () => {
    // Zigzag: each point is far off the baseline
    const zigzag: Ring = [
      [27.76, -82.64],
      [27.77, -82.635], // large deviation from baseline
      [27.76, -82.63],
      [27.77, -82.625], // large deviation
      [27.76, -82.62],
    ]
    const result = douglasPeucker(zigzag, 0.00005)
    // All points retained because deviations >> epsilon
    expect(result).toHaveLength(zigzag.length)
  })

  it('output is an open ring (first point not equal to last)', () => {
    const result = douglasPeucker(SQUARE, 0.00001)
    expect(result[0]).not.toEqual(result[result.length - 1])
  })

  it('returns input unchanged for a 2-point ring', () => {
    const twoPoints: Ring = [
      [27.76, -82.64],
      [27.77, -82.63],
    ]
    expect(douglasPeucker(twoPoints, 0.00005)).toEqual(twoPoints)
  })

  it('returns input unchanged for an empty ring', () => {
    expect(douglasPeucker([], 0.00005)).toEqual([])
  })

  it('output always has fewer or equal points than input', () => {
    const result = douglasPeucker(SQUARE, 0.00005)
    expect(result.length).toBeLessThanOrEqual(SQUARE.length)
  })
})
