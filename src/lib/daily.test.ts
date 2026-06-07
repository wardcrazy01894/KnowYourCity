import { describe, it, expect } from 'vitest'
import {
  getDateKey,
  hashStringToSeed,
  mulberry32,
  selectDailyLocations,
} from './daily'
import type { Location, LocationCategory } from '../types'

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
