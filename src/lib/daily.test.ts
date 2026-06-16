import { describe, it, expect } from 'vitest'
import {
  DIFFICULTY_PLAN,
  MIN_NON_FOOD_PER_DAY,
  getDateKey,
  isValidDateKey,
  hashStringToSeed,
  mulberry32,
  selectDailyLocations,
  selectPolygonLocations,
} from './daily'
import type { Difficulty, Location, LocationCategory } from '../types'

function makeLocations(n: number): Location[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `loc-${String(i).padStart(3, '0')}`,
    name: `Place ${i}`,
    lat: 27.7 + i * 0.001,
    lng: -82.6 - i * 0.001,
    category: 'attraction' as const,
    source: 'manual' as const,
    attribution: 'test',
  }))
}

function loc(id: string, category: LocationCategory): Location {
  return {
    id,
    name: id,
    lat: 27.77,
    lng: -82.63,
    category,
    source: 'manual',
    attribution: 'test',
  }
}

describe('getDateKey (America/New_York, DST-aware)', () => {
  it('rolls over at midnight Eastern, not UTC', () => {
    // June = EDT (UTC-4); Eastern midnight is 04:00 UTC.
    // 03:59 UTC is still the previous Eastern day.
    expect(getDateKey(new Date('2026-06-07T03:59:00Z'))).toBe('2026-06-06')
    // 04:00 UTC is the new Eastern day.
    expect(getDateKey(new Date('2026-06-07T04:00:00Z'))).toBe('2026-06-07')
  })

  it('handles standard time too (EST, UTC-5)', () => {
    // January = EST (UTC-5); Eastern midnight is 05:00 UTC.
    expect(getDateKey(new Date('2026-01-07T04:59:00Z'))).toBe('2026-01-06')
    expect(getDateKey(new Date('2026-01-07T05:00:00Z'))).toBe('2026-01-07')
  })

  it('formats as YYYY-MM-DD', () => {
    expect(getDateKey(new Date('2026-06-07T12:00:00Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })
})

describe('isValidDateKey', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateKey('2026-06-11')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true) // leap day
  })

  it('rejects format mismatches', () => {
    expect(isValidDateKey('2026-6-11')).toBe(false)
    expect(isValidDateKey('garbage')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
  })

  it('rejects well-formatted but impossible dates (the ?date=2026-99-99 crash)', () => {
    // These pass a format-only regex but produce Invalid Date / silently roll
    // over — previousDateKey would then throw RangeError on game completion.
    expect(isValidDateKey('2026-99-99')).toBe(false)
    expect(isValidDateKey('2026-02-30')).toBe(false) // rolls over to Mar 2
    expect(isValidDateKey('2023-02-29')).toBe(false) // not a leap year
    expect(isValidDateKey('2026-00-10')).toBe(false)
  })
})

describe('hashStringToSeed / mulberry32', () => {
  it('is deterministic for the same input', () => {
    expect(hashStringToSeed('2026-06-06')).toBe(hashStringToSeed('2026-06-06'))
    const a = mulberry32(123)
    const b = mulberry32(123)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('differs across inputs', () => {
    expect(hashStringToSeed('2026-06-06')).not.toBe(
      hashStringToSeed('2026-06-07'),
    )
  })
})

describe('selectDailyLocations', () => {
  const pool = makeLocations(50)

  it('returns the requested count', () => {
    expect(selectDailyLocations(pool, '2026-06-06', 5)).toHaveLength(5)
  })

  it('is deterministic: same date + list => identical picks in identical order', () => {
    const a = selectDailyLocations(pool, '2026-06-06', 5).map((l) => l.id)
    const b = selectDailyLocations(pool, '2026-06-06', 5).map((l) => l.id)
    expect(a).toEqual(b)
  })

  it('does not depend on the input array order', () => {
    const shuffled = [...pool].reverse()
    const a = selectDailyLocations(pool, '2026-06-06', 5).map((l) => l.id)
    const b = selectDailyLocations(shuffled, '2026-06-06', 5).map((l) => l.id)
    expect(a).toEqual(b)
  })

  it('produces different sets on different days (usually)', () => {
    const a = selectDailyLocations(pool, '2026-06-06', 5).map((l) => l.id)
    const b = selectDailyLocations(pool, '2026-06-07', 5).map((l) => l.id)
    expect(a).not.toEqual(b)
  })

  it('returns no duplicates', () => {
    const ids = selectDailyLocations(pool, '2026-06-06', 5).map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('throws when the pool is too small', () => {
    expect(() =>
      selectDailyLocations(makeLocations(3), '2026-06-06', 5),
    ).toThrow()
  })
})

describe('selectDailyLocations category plan', () => {
  const pool = [
    ...['c1', 'c2', 'c3'].map((i) => loc(i, 'cafe')),
    ...['r1', 'r2', 'r3'].map((i) => loc(i, 'restaurant')),
    ...['b1', 'b2', 'b3'].map((i) => loc(i, 'bar')),
    ...['m1', 'm2', 'm3'].map((i) => loc(i, 'museum')),
    ...['p1', 'p2'].map((i) => loc(i, 'park')),
    ...['g1', 'g2'].map((i) => loc(i, 'golf_course')),
  ]
  const NON_FOOD: LocationCategory[] = [
    'attraction',
    'museum',
    'park',
    'landmark',
    'venue',
    'golf_course',
    'plaza',
    'other',
  ]

  it('orders rounds: coffee, restaurant, bar, landmark, wildcard', () => {
    const picks = selectDailyLocations(pool, '2026-06-06')
    expect(picks).toHaveLength(5)
    expect(picks[0].category).toBe('cafe')
    expect(picks[1].category).toBe('restaurant')
    expect(picks[2].category).toBe('bar')
    expect(NON_FOOD).toContain(picks[3].category) // landmark = not food/drink
    expect(new Set(picks.map((p) => p.id)).size).toBe(5)
  })

  it('is deterministic for the same date', () => {
    const a = selectDailyLocations(pool, '2026-06-06').map((l) => l.id)
    const b = selectDailyLocations(pool, '2026-06-06').map((l) => l.id)
    expect(a).toEqual(b)
  })

  it('falls back to fill slots when a category bucket is empty', () => {
    const onlyLandmarks = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'].map((i) =>
      loc(i, 'museum'),
    )
    const picks = selectDailyLocations(onlyLandmarks, '2026-06-06')
    expect(picks).toHaveLength(5)
    expect(new Set(picks.map((l) => l.id)).size).toBe(5)
  })
})

function dloc(
  id: string,
  category: LocationCategory,
  difficulty: Difficulty,
): Location {
  return {
    id,
    name: id,
    lat: 27.77,
    lng: -82.63,
    category,
    difficulty,
    source: 'manual',
    attribution: 'test',
  }
}

describe('selectDailyLocations difficulty plan (2 easy, 2 medium, 1 hard)', () => {
  // Every location carries a difficulty -> the difficulty plan engages.
  const pool = [
    dloc('e1', 'museum', 'easy'),
    dloc('e2', 'park', 'easy'),
    dloc('e3', 'restaurant', 'easy'),
    dloc('e4', 'bar', 'easy'),
    dloc('m1', 'cafe', 'medium'),
    dloc('m2', 'restaurant', 'medium'),
    dloc('m3', 'bar', 'medium'),
    dloc('m4', 'museum', 'medium'),
    dloc('h1', 'restaurant', 'hard'),
    dloc('h2', 'cafe', 'hard'),
    dloc('h3', 'bar', 'hard'),
  ]

  it('exposes the plan order easy, easy, medium, medium, hard', () => {
    expect(DIFFICULTY_PLAN).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
    ])
  })

  it('orders rounds by difficulty: easy, easy, medium, medium, hard', () => {
    const picks = selectDailyLocations(pool, '2026-06-06')
    expect(picks.map((p) => p.difficulty)).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
    ])
    expect(new Set(picks.map((p) => p.id)).size).toBe(5)
  })

  it('is deterministic and order-independent', () => {
    const a = selectDailyLocations(pool, '2026-06-06').map((l) => l.id)
    const b = selectDailyLocations([...pool].reverse(), '2026-06-06').map(
      (l) => l.id,
    )
    expect(a).toEqual(b)
  })

  it('layers category variety within difficulty (the paired slots differ)', () => {
    const picks = selectDailyLocations(pool, '2026-06-06')
    expect(picks[0].category).not.toBe(picks[1].category) // the two easy
    expect(picks[2].category).not.toBe(picks[3].category) // the two medium
  })

  it('falls back to other difficulties when a bucket is too small', () => {
    const short = [
      dloc('e1', 'park', 'easy'), // only ONE easy, but plan wants two
      dloc('m1', 'cafe', 'medium'),
      dloc('m2', 'bar', 'medium'),
      dloc('h1', 'restaurant', 'hard'),
      dloc('h2', 'museum', 'hard'),
      dloc('h3', 'cafe', 'hard'),
    ]
    const picks = selectDailyLocations(short, '2026-06-06')
    expect(picks).toHaveLength(5)
    expect(new Set(picks.map((l) => l.id)).size).toBe(5)
  })

  it('falls back to the legacy category plan when difficulty is not on every location', () => {
    const mixed = [
      ...['c1', 'c2'].map((i) => loc(i, 'cafe')), // no difficulty
      dloc('r1', 'restaurant', 'easy'),
      dloc('b1', 'bar', 'medium'),
      dloc('m1', 'museum', 'hard'),
      dloc('m2', 'park', 'hard'),
    ]
    const picks = selectDailyLocations(mixed, '2026-06-06')
    // Legacy plan leads with a cafe; the difficulty plan never would.
    expect(picks[0].category).toBe('cafe')
  })
})

const FOOD_CATS = new Set(['cafe', 'restaurant', 'bar'])
const DATES = [
  '2026-06-06',
  '2026-07-15',
  '2026-09-01',
  '2026-12-25',
  '2027-03-03',
]

describe('selectDailyLocations — play cap (inPlay filtering)', () => {
  // 5 in-play rows (each enriched) + benched rows that, if NOT filtered out,
  // would either be picked or (lacking difficulty) flip the city to the legacy
  // plan. Filtering to inPlay must keep the difficulty plan and never pick a
  // benched row.
  const benched = (id: string, category: LocationCategory): Location => ({
    ...loc(id, category),
    inPlay: false, // no difficulty: out of the play cap
  })
  const pool: Location[] = [
    dloc('e1', 'museum', 'easy'),
    dloc('e2', 'park', 'easy'),
    dloc('m1', 'cafe', 'medium'),
    dloc('m2', 'restaurant', 'medium'),
    dloc('h1', 'bar', 'hard'),
    benched('x1', 'restaurant'),
    benched('x2', 'cafe'),
    benched('x3', 'park'),
  ]

  it('never selects an inPlay:false location', () => {
    for (const d of DATES) {
      const picks = selectDailyLocations(pool, d)
      expect(picks.every((p) => p.inPlay !== false)).toBe(true)
      expect(picks.some((p) => p.id.startsWith('x'))).toBe(false)
    }
  })

  it('still runs the difficulty plan off the in-play rows', () => {
    const picks = selectDailyLocations(pool, '2026-06-06')
    expect(picks.map((p) => p.difficulty)).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
    ])
  })

  it('throws if fewer than a full day are in play', () => {
    const tooFew = [
      dloc('e1', 'museum', 'easy'),
      dloc('e2', 'park', 'easy'),
      benched('x1', 'restaurant'),
      benched('x2', 'cafe'),
      benched('x3', 'bar'),
      benched('x4', 'restaurant'),
    ]
    expect(() => selectDailyLocations(tooFew, '2026-06-06')).toThrow()
  })
})

describe('selectDailyLocations — non-food floor (parks/landmarks show up)', () => {
  // Adversarial pool: the ONLY non-food (a park) sits in the easy bucket, where
  // plain category variety can fill both easy slots with food and skip it,
  // leaving an all-food day. The floor must prefer the park so at least
  // MIN_NON_FOOD_PER_DAY non-food always appears.
  const pool: Location[] = [
    dloc('fe1', 'restaurant', 'easy'),
    dloc('fe2', 'cafe', 'easy'),
    dloc('pe1', 'park', 'easy'),
    dloc('fm1', 'restaurant', 'medium'),
    dloc('fm2', 'cafe', 'medium'),
    dloc('fh1', 'bar', 'hard'),
    dloc('fh2', 'cafe', 'hard'),
  ]
  // 30 dates: a robust guarantee, not a lucky seed.
  const manyDates = Array.from(
    { length: 30 },
    (_, i) =>
      `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  )

  it('always includes at least one non-food pick (never an all-food day), across many dates', () => {
    // Assert the literal contract (>= 1), not >= MIN_NON_FOOD_PER_DAY, so the
    // test still fails if the floor is ever removed/zeroed.
    expect(MIN_NON_FOOD_PER_DAY).toBeGreaterThanOrEqual(1)
    for (const d of manyDates) {
      const picks = selectDailyLocations(pool, d)
      const nonFood = picks.filter((p) => !FOOD_CATS.has(p.category))
      expect(
        nonFood.length,
        `${d}: only ${nonFood.length} non-food in ${picks.map((p) => p.category).join(',')}`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('still honors the exact difficulty ramp while enforcing the floor', () => {
    for (const d of DATES) {
      const picks = selectDailyLocations(pool, d)
      expect(picks.map((p) => p.difficulty)).toEqual([
        'easy',
        'easy',
        'medium',
        'medium',
        'hard',
      ])
    }
  })
})

describe('selectDailyLocations — overrides', () => {
  const pool = [
    dloc('e1', 'museum', 'easy'),
    dloc('e2', 'park', 'easy'),
    dloc('e3', 'restaurant', 'easy'),
    dloc('m1', 'cafe', 'medium'),
    dloc('m2', 'restaurant', 'medium'),
    dloc('m3', 'bar', 'medium'),
    dloc('h1', 'restaurant', 'hard'),
    dloc('h2', 'cafe', 'hard'),
    dloc('h3', 'bar', 'hard'),
  ]

  it('returns override IDs in order when a match exists for the seed', () => {
    const picks = selectDailyLocations(pool, 'stpete:2026-06-13', 5, {
      'stpete:2026-06-13': ['e2', 'm3', 'e1', 'm1', 'h2'],
    })
    expect(picks.map((p) => p.id)).toEqual(['e2', 'm3', 'e1', 'm1', 'h2'])
  })

  it('falls through to PRNG when no override exists for the seed', () => {
    const overrides = { 'stpete:2026-06-14': ['e1', 'e2', 'm1', 'm2', 'h1'] }
    const picks = selectDailyLocations(pool, 'stpete:2026-06-13', 5, overrides)
    expect(picks).toHaveLength(5)
    const poolIds = new Set(pool.map((l) => l.id))
    picks.forEach((p) => expect(poolIds.has(p.id)).toBe(true))
    expect(picks.map((p) => p.id)).not.toEqual(['e1', 'e2', 'm1', 'm2', 'h1'])
  })

  it('ignores overrides parameter when undefined', () => {
    expect(() =>
      selectDailyLocations(pool, 'stpete:2026-06-13', 5),
    ).not.toThrow()
  })

  it('falls through to PRNG when an override ID is missing from the pool', () => {
    const picks = selectDailyLocations(pool, 'stpete:2026-06-13', 5, {
      'stpete:2026-06-13': ['e2', 'm3', 'e1', 'm1', 'UNKNOWN-ID'],
    })
    expect(picks).toHaveLength(5)
    const poolIds = new Set(pool.map((l) => l.id))
    picks.forEach((p) => expect(poolIds.has(p.id)).toBe(true))
    expect(picks.map((p) => p.id)).not.toContain('UNKNOWN-ID')
  })

  it('falls through to PRNG when an override ID is inPlay:false', () => {
    const withBenched = pool.map((l) =>
      l.id === 'e2' ? { ...l, inPlay: false as const } : l,
    )
    const picks = selectDailyLocations(withBenched, 'stpete:2026-06-13', 5, {
      'stpete:2026-06-13': ['e2', 'm3', 'e1', 'm1', 'h2'],
    })
    expect(picks).toHaveLength(5)
    expect(picks.map((p) => p.id)).not.toContain('e2')
  })
})

describe('selectPolygonLocations', () => {
  const poly: [number, number][] = [
    [27.77, -82.63],
    [27.78, -82.63],
    [27.78, -82.62],
  ]

  it('returns every location that has a non-empty polygon, sorted by id', () => {
    const all: Location[] = [
      { ...loc('zebra-park', 'park'), polygon: poly },
      loc('alpha-cafe', 'cafe'),
      { ...loc('apple-park', 'park'), polygon: poly },
      { ...loc('empty-poly', 'park'), polygon: [] },
    ]
    const picks = selectPolygonLocations(all)
    expect(picks.map((p) => p.id)).toEqual(['apple-park', 'zebra-park'])
  })

  it('includes inPlay:false polygons (this is a verification tool, not the daily)', () => {
    const all: Location[] = [
      { ...loc('benched-park', 'park'), polygon: poly, inPlay: false },
    ]
    expect(selectPolygonLocations(all).map((p) => p.id)).toEqual([
      'benched-park',
    ])
  })

  it('returns [] when no location has a polygon', () => {
    expect(
      selectPolygonLocations([loc('a', 'cafe'), loc('b', 'park')]),
    ).toEqual([])
  })

  it('restricts to a given id subset (still polygon-only, sorted)', () => {
    const all: Location[] = [
      { ...loc('zebra-park', 'park'), polygon: poly },
      { ...loc('apple-park', 'park'), polygon: poly },
      { ...loc('mango-park', 'park'), polygon: poly },
      loc('alpha-cafe', 'cafe'),
    ]
    expect(
      selectPolygonLocations(all, ['zebra-park', 'apple-park']).map(
        (p) => p.id,
      ),
    ).toEqual(['apple-park', 'zebra-park'])
  })

  it('ignores subset ids that have no polygon', () => {
    const all: Location[] = [
      { ...loc('apple-park', 'park'), polygon: poly },
      loc('alpha-cafe', 'cafe'),
    ]
    expect(
      selectPolygonLocations(all, ['alpha-cafe', 'apple-park']).map(
        (p) => p.id,
      ),
    ).toEqual(['apple-park'])
  })

  it('returns every polygon when the subset is null', () => {
    const all: Location[] = [
      { ...loc('apple-park', 'park'), polygon: poly },
      { ...loc('zebra-park', 'park'), polygon: poly },
    ]
    expect(selectPolygonLocations(all, null).map((p) => p.id)).toEqual([
      'apple-park',
      'zebra-park',
    ])
  })
})
