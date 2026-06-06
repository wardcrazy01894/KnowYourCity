import { describe, it, expect } from 'vitest'
import {
  getUtcDateKey,
  hashStringToSeed,
  mulberry32,
  selectDailyLocations,
} from './daily'
import type { Location } from '../types'

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

describe('getUtcDateKey', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(getUtcDateKey(new Date('2026-06-06T23:30:00Z'))).toBe('2026-06-06')
    // 00:30 UTC on the 7th is still the 7th even if local is the 6th.
    expect(getUtcDateKey(new Date('2026-06-07T00:30:00Z'))).toBe('2026-06-07')
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
