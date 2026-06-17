import { describe, it, expect } from 'vitest'
import {
  buildPolygonQuery,
  buildElementQuery,
  centroid,
  haversineMeters,
  douglasPeucker,
  extractOuterRing,
  pickBestMatch,
  buildWayGeomIndex,
  filterByName,
  simplifyToCap,
  selectEligibleRows,
  finalizeRing,
} from './add-polygons.mjs'

// ---------------------------------------------------------------------------
// buildPolygonQuery
// ---------------------------------------------------------------------------

describe('buildPolygonQuery', () => {
  const bbox = [27.6, -82.8, 27.9, -82.5]

  it('requests full geometry (out geom) for ways and relations', () => {
    const q = buildPolygonQuery('Vinoy Park', bbox)
    expect(q).toContain('out geom')
    expect(q).toContain('way[')
    expect(q).toContain('relation[')
  })

  it('anchors and case-insensitively matches the name', () => {
    const q = buildPolygonQuery('Vinoy Park', bbox)
    expect(q).toContain('"^Vinoy Park$",i')
  })

  it('escapes regex metacharacters in the name', () => {
    const q = buildPolygonQuery('A+B (Park).', bbox)
    expect(q).toContain('A\\+B \\(Park\\)\\.')
  })

  it('matches by name only (no restrictive leisure tag filter)', () => {
    // Lakes (natural=water) and country clubs (landuse=*) must still match, so
    // the query must NOT pin a leisure tag.
    const q = buildPolygonQuery('X', bbox)
    expect(q).not.toContain('leisure')
    expect(q).not.toContain('natural')
  })

  it('interpolates the bbox in S,W,N,E order', () => {
    const q = buildPolygonQuery('X', bbox)
    expect(q).toContain('(27.6,-82.8,27.9,-82.5)')
  })

  it('recurses into members so multipolygon ways are fetched with geometry', () => {
    // overpass-api.de does NOT embed member geometry on a bare relation query —
    // the relation comes back with members:0. Recursing (._;>;) pulls the
    // member ways back as separate elements carrying their geometry.
    const q = buildPolygonQuery('Lake Maggiore', bbox)
    expect(q).toContain('(._;>;)')
  })
})

// ---------------------------------------------------------------------------
// buildElementQuery
// ---------------------------------------------------------------------------

describe('buildElementQuery', () => {
  it('fetches a specific way by id with geometry and member recursion', () => {
    const q = buildElementQuery('way', 1196843509)
    expect(q).toContain('way(1196843509)')
    expect(q).toContain('(._;>;)')
    expect(q).toContain('out geom')
  })

  it('fetches a specific relation by id', () => {
    const q = buildElementQuery('relation', 14526770)
    expect(q).toContain('relation(14526770)')
  })

  it('rejects an unsupported element type', () => {
    expect(() => buildElementQuery('node', 1)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// buildWayGeomIndex
// ---------------------------------------------------------------------------

describe('buildWayGeomIndex', () => {
  it('indexes way geometry by id and ignores relations/nodes', () => {
    const idx = buildWayGeomIndex([
      { type: 'way', id: 101, geometry: [{ lat: 1, lon: 2 }] },
      { type: 'relation', id: 5, members: [] },
      { type: 'node', id: 9, lat: 1, lon: 2 },
    ])
    expect(idx.get(101)).toEqual([{ lat: 1, lon: 2 }])
    expect(idx.has(5)).toBe(false)
    expect(idx.has(9)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterByName
// ---------------------------------------------------------------------------

describe('filterByName', () => {
  it('keeps only elements whose name tag matches (anchored, case-insensitive)', () => {
    const els = [
      { type: 'relation', id: 1, tags: { name: 'Lake Maggiore' } },
      { type: 'way', id: 2, tags: { name: 'Lake Maggiore Island' } }, // inner hole — excluded
      { type: 'way', id: 3, tags: {} }, // unnamed outer member — excluded
      { type: 'way', id: 4, tags: { name: 'lake maggiore' } }, // case-insensitive — kept
      { type: 'node', id: 5 }, // no tags — excluded
    ]
    const out = filterByName(els, 'Lake Maggiore')
    expect(out.map((e) => e.id).sort()).toEqual([1, 4])
  })
})

// ---------------------------------------------------------------------------
// centroid + haversineMeters
// ---------------------------------------------------------------------------

describe('centroid', () => {
  it('averages the coordinate pairs', () => {
    const c = centroid([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])
    expect(c).toEqual({ lat: 1, lng: 1 })
  })
})

describe('haversineMeters', () => {
  it('is ~0 for identical points', () => {
    expect(
      haversineMeters({ lat: 27.77, lng: -82.63 }, { lat: 27.77, lng: -82.63 }),
    ).toBeCloseTo(0, 3)
  })
  it('one degree of latitude ≈ 111 km', () => {
    const d = haversineMeters({ lat: 27, lng: -82 }, { lat: 28, lng: -82 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })
})

// ---------------------------------------------------------------------------
// douglasPeucker
// ---------------------------------------------------------------------------

describe('douglasPeucker', () => {
  it('collapses collinear points to the endpoints', () => {
    const collinear = [
      [27.76, -82.64],
      [27.762, -82.64],
      [27.764, -82.64],
      [27.766, -82.64],
    ]
    expect(douglasPeucker(collinear, 0.00005)).toHaveLength(2)
  })

  it('returns rings of ≤ 2 points unchanged', () => {
    const two = [
      [27.76, -82.64],
      [27.77, -82.63],
    ]
    expect(douglasPeucker(two, 0.00005)).toEqual(two)
  })
})

// ---------------------------------------------------------------------------
// simplifyToCap
// ---------------------------------------------------------------------------

describe('simplifyToCap', () => {
  it('leaves a ring already within the cap untouched', () => {
    const ring = [
      [27.76, -82.64],
      [27.77, -82.63],
      [27.78, -82.62],
    ]
    expect(simplifyToCap(ring, 0.00005, 100)).toEqual(
      douglasPeucker(ring, 0.00005),
    )
  })

  it('escalates epsilon until a dense ring fits under the cap', () => {
    // A 400-point jagged *2-D blob* (noisy circle) that 5 m D–P leaves well over
    // the cap. Heavy simplification collapses it toward a triangle, not a line.
    const ring = []
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * 2 * Math.PI
      const r = 0.01 + (i % 2) * 0.002 // jagged radius
      ring.push([27.7 + r * Math.cos(a), -82.65 + r * Math.sin(a)])
    }
    const out = simplifyToCap(ring, 0.00005, 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// extractOuterRing
// ---------------------------------------------------------------------------

const closedWay = (latlons) => ({
  type: 'way',
  id: 1,
  geometry: latlons.map(([lat, lon]) => ({ lat, lon })),
})

describe('extractOuterRing', () => {
  it('strips the repeated closing node from a closed way → open ring', () => {
    const ring = extractOuterRing(
      closedWay([
        [27.77, -82.64],
        [27.77, -82.63],
        [27.76, -82.63],
        [27.76, -82.64],
        [27.77, -82.64], // repeated first node
      ]),
    )
    expect(ring).toHaveLength(4)
    expect(ring[0]).toEqual([27.77, -82.64])
    expect(ring[ring.length - 1]).not.toEqual(ring[0])
  })

  it('returns null for a node element', () => {
    expect(extractOuterRing({ type: 'node', id: 9, lat: 1, lon: 2 })).toBeNull()
  })

  it('returns null for a way with too few points', () => {
    expect(
      extractOuterRing(
        closedWay([
          [27.77, -82.64],
          [27.76, -82.63],
        ]),
      ),
    ).toBeNull()
  })

  it('returns null for an OPEN (linear) way — e.g. a street sharing the name', () => {
    expect(
      extractOuterRing({
        type: 'way',
        id: 2,
        geometry: [
          { lat: 27.77, lon: -82.64 },
          { lat: 27.77, lon: -82.63 },
          { lat: 27.76, lon: -82.63 },
          { lat: 27.76, lon: -82.62 }, // does not return to the first node
        ],
      }),
    ).toBeNull()
  })

  it('uses a relation’s self-closed outer member', () => {
    const rel = {
      type: 'relation',
      id: 5,
      members: [
        {
          role: 'outer',
          geometry: [
            { lat: 27.77, lon: -82.64 },
            { lat: 27.77, lon: -82.63 },
            { lat: 27.76, lon: -82.63 },
            { lat: 27.77, lon: -82.64 },
          ],
        },
        { role: 'inner', geometry: [] },
      ],
    }
    const ring = extractOuterRing(rel)
    expect(ring).toHaveLength(3)
  })

  it('stitches multiple outer arcs into one closed ring', () => {
    // Two arcs of a square that share endpoints and together close the ring:
    //   arc1: NW → NE → SE     arc2: SE → SW → NW
    const rel = {
      type: 'relation',
      id: 8,
      members: [
        {
          role: 'outer',
          geometry: [
            { lat: 27.77, lon: -82.64 }, // NW
            { lat: 27.77, lon: -82.63 }, // NE
            { lat: 27.76, lon: -82.63 }, // SE
          ],
        },
        {
          role: 'outer',
          geometry: [
            { lat: 27.76, lon: -82.63 }, // SE (shared)
            { lat: 27.76, lon: -82.64 }, // SW
            { lat: 27.77, lon: -82.64 }, // NW (closes)
          ],
        },
      ],
    }
    const ring = extractOuterRing(rel)
    // 4 distinct corners (open ring, closing node stripped).
    expect(ring).toHaveLength(4)
  })

  it('stitches arcs even when one is reversed', () => {
    const rel = {
      type: 'relation',
      id: 9,
      members: [
        {
          role: 'outer',
          geometry: [
            { lat: 27.77, lon: -82.64 },
            { lat: 27.77, lon: -82.63 },
            { lat: 27.76, lon: -82.63 },
          ],
        },
        {
          // Reversed: NW → SW → SE (must be flipped to chain onto the SE tail).
          role: 'outer',
          geometry: [
            { lat: 27.77, lon: -82.64 }, // NW
            { lat: 27.76, lon: -82.64 }, // SW
            { lat: 27.76, lon: -82.63 }, // SE
          ],
        },
      ],
    }
    expect(extractOuterRing(rel)).toHaveLength(4)
  })

  it('returns null (multi-arc) when the outer member is an open arc', () => {
    const rel = {
      type: 'relation',
      id: 6,
      members: [
        {
          role: 'outer',
          geometry: [
            { lat: 27.77, lon: -82.64 },
            { lat: 27.77, lon: -82.63 },
            { lat: 27.76, lon: -82.63 }, // not closed back to start
          ],
        },
      ],
    }
    expect(extractOuterRing(rel)).toBeNull()
  })

  it('returns null when a relation has no outer member', () => {
    const rel = {
      type: 'relation',
      id: 7,
      members: [{ role: 'inner', geometry: [] }],
    }
    expect(extractOuterRing(rel)).toBeNull()
  })

  it('resolves outer member geometry by ref from the way index when inline geometry is absent', () => {
    // Mirrors overpass-api.de's response: the relation's members carry NO inline
    // geometry (only type/ref/role); the geometry lives on separately-returned
    // way elements indexed by id.
    const rel = {
      type: 'relation',
      id: 5,
      members: [
        { role: 'outer', type: 'way', ref: 101 },
        { role: 'inner', type: 'way', ref: 102 },
      ],
    }
    const wayIndex = new Map([
      [
        101,
        [
          { lat: 27.77, lon: -82.64 },
          { lat: 27.77, lon: -82.63 },
          { lat: 27.76, lon: -82.63 },
          { lat: 27.77, lon: -82.64 }, // self-closed outer
        ],
      ],
    ])
    const ring = extractOuterRing(rel, wayIndex)
    expect(ring).toHaveLength(3)
  })

  it('returns null for a relation whose outer member ref is missing from the index', () => {
    const rel = {
      type: 'relation',
      id: 6,
      members: [{ role: 'outer', type: 'way', ref: 999 }],
    }
    expect(extractOuterRing(rel, new Map())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// pickBestMatch
// ---------------------------------------------------------------------------

describe('pickBestMatch', () => {
  // A small square centred ~250 m NE of loc (in range, but not dead-on).
  const near = closedWay([
    [27.772, -82.637],
    [27.772, -82.627],
    [27.762, -82.627],
    [27.762, -82.637],
    [27.772, -82.637],
  ])
  // A square ~5 km away.
  const far = closedWay([
    [27.82, -82.64],
    [27.82, -82.63],
    [27.81, -82.63],
    [27.81, -82.64],
    [27.82, -82.64],
  ])
  const loc = { lat: 27.765, lng: -82.635 }

  it('returns the only in-range candidate', () => {
    expect(pickBestMatch([near], loc, 'x')).toBe(near)
  })

  it('returns null when every candidate is beyond the centroid radius', () => {
    expect(pickBestMatch([far], loc, 'x')).toBeNull()
  })

  it('picks the nearest when several are in range', () => {
    const alsoNear = closedWay([
      [27.766, -82.636],
      [27.766, -82.634],
      [27.764, -82.634],
      [27.764, -82.636],
      [27.766, -82.636],
    ])
    // alsoNear is centred almost exactly on loc → should win over `near`.
    expect(pickBestMatch([near, alsoNear], loc, 'x')).toBe(alsoNear)
  })

  it('returns null when no element yields a usable ring', () => {
    expect(
      pickBestMatch(
        [{ type: 'node', id: 1, lat: 27.765, lon: -82.635 }],
        loc,
        'x',
      ),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// selectEligibleRows
// ---------------------------------------------------------------------------

describe('selectEligibleRows', () => {
  const rows = [
    { id: 'inplay-park', category: 'park', inPlay: true },
    { id: 'inplay-golf', category: 'golf_course', inPlay: true },
    { id: 'benched-park', category: 'park', inPlay: false },
    { id: 'benched-golf', category: 'golf_course', inPlay: false },
    { id: 'inplay-cafe', category: 'cafe', inPlay: true }, // wrong category
    {
      id: 'inplay-park-done',
      category: 'park',
      inPlay: true,
      polygon: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
    },
  ]

  it('defaults to in-play, large-footprint rows lacking a polygon', () => {
    const ids = selectEligibleRows(rows).map((l) => l.id)
    expect(ids).toEqual(['inplay-park', 'inplay-golf'])
  })

  it('includeBenched widens to benched park/golf rows too', () => {
    const ids = selectEligibleRows(rows, { includeBenched: true }).map(
      (l) => l.id,
    )
    expect(ids).toEqual([
      'inplay-park',
      'inplay-golf',
      'benched-park',
      'benched-golf',
    ])
  })

  it('never includes a non-large-footprint category', () => {
    for (const opts of [{}, { includeBenched: true }, { force: true }]) {
      expect(
        selectEligibleRows(rows, opts).some((l) => l.category === 'cafe'),
      ).toBe(false)
    }
  })

  it('treats an empty polygon array as "no polygon yet" (still eligible)', () => {
    const empty = [
      {
        id: 'inplay-park-emptypoly',
        category: 'park',
        inPlay: true,
        polygon: [],
      },
    ]
    expect(selectEligibleRows(empty).map((l) => l.id)).toEqual([
      'inplay-park-emptypoly',
    ])
  })

  it('force re-includes rows that already have a polygon', () => {
    expect(
      selectEligibleRows(rows, { force: true }).map((l) => l.id),
    ).toContain('inplay-park-done')
    expect(selectEligibleRows(rows).map((l) => l.id)).not.toContain(
      'inplay-park-done',
    )
  })

  it('force + includeBenched covers every park/golf row regardless of state', () => {
    const ids = selectEligibleRows(rows, {
      force: true,
      includeBenched: true,
    }).map((l) => l.id)
    expect(ids).toEqual([
      'inplay-park',
      'inplay-golf',
      'benched-park',
      'benched-golf',
      'inplay-park-done',
    ])
  })
})

// ---------------------------------------------------------------------------
// finalizeRing
// ---------------------------------------------------------------------------

describe('finalizeRing', () => {
  it('rounds to 5 dp and keeps a well-formed open ring open', () => {
    const out = finalizeRing([
      [47.123456, -122.123456],
      [47.2, -122.2],
      [47.3, -122.3],
    ])
    expect(out).toEqual([
      [47.12346, -122.12346],
      [47.2, -122.2],
      [47.3, -122.3],
    ])
  })

  it('drops a closing duplicate that rounding collapses onto the start', () => {
    // First and last differ in the 6th dp; at 5 dp they coincide → would be a
    // CLOSED ring the dataset guard rejects. finalizeRing must re-open it.
    const out = finalizeRing([
      [47.100001, -122.2],
      [47.2, -122.3],
      [47.3, -122.4],
      [47.100004, -122.2], // rounds to 47.1, -122.2 == first
    ])
    expect(out).toHaveLength(3)
    const [f, l] = [out[0], out[out.length - 1]]
    expect(f[0] === l[0] && f[1] === l[1]).toBe(false)
  })

  it('returns null when re-opening leaves fewer than 3 points', () => {
    expect(
      finalizeRing([
        [47.1, -122.2],
        [47.2, -122.3],
        [47.100000001, -122.2], // collapses onto first → only 2 distinct
      ]),
    ).toBeNull()
    expect(finalizeRing([[47.1, -122.2]])).toBeNull()
  })
})
