import { describe, it, expect } from 'vitest'
import {
  MAX_TOTAL,
  CITY_TZ,
  dateKeyFor,
  validDateKeys,
  isValidScore,
  isValidClientId,
  isValidDateKey,
  validateView,
  validateSubmission,
  cutoffDateKey,
  RETENTION_DAYS,
  previousDateKey,
  advanceStreak,
} from './leaderboard-lib.mjs'

/**
 * Pure-helper tests for the leaderboard Worker. These are the validation gates
 * that keep junk out of D1 (unknown cities, forged dates, impossible scores) —
 * exercise them directly so a regression can't ship silently. The full request
 * path (fail-closed, rate limit, Turnstile, D1 batch) is covered in
 * leaderboard.handler.test.mjs.
 */

describe('dateKeyFor', () => {
  it('formats a city-local calendar day as YYYY-MM-DD', () => {
    // 2026-06-15T02:00Z is still 2026-06-14 in US Eastern.
    const d = new Date('2026-06-15T02:00:00Z')
    expect(dateKeyFor(d, 'America/New_York')).toBe('2026-06-14')
    expect(dateKeyFor(d, 'UTC')).toBe('2026-06-15')
  })
})

describe('validDateKeys', () => {
  it('accepts yesterday/today/tomorrow in the city timezone (skew + rollover)', () => {
    const now = new Date('2026-06-15T12:00:00Z')
    const keys = validDateKeys(now, 'America/New_York')
    expect(keys.has('2026-06-14')).toBe(true)
    expect(keys.has('2026-06-15')).toBe(true)
    expect(keys.has('2026-06-16')).toBe(true)
    expect(keys.has('2026-06-13')).toBe(false)
    expect(keys.has('2099-01-01')).toBe(false)
  })
})

describe('isValidScore', () => {
  it('accepts integers in [0, MAX_TOTAL]', () => {
    expect(isValidScore(0)).toBe(true)
    expect(isValidScore(MAX_TOTAL)).toBe(true)
    expect(isValidScore(317)).toBe(true)
  })
  it('rejects out-of-range, floats, NaN, and non-numbers', () => {
    expect(isValidScore(-1)).toBe(false)
    expect(isValidScore(MAX_TOTAL + 1)).toBe(false)
    expect(isValidScore(12.5)).toBe(false)
    expect(isValidScore(NaN)).toBe(false)
    expect(isValidScore('500')).toBe(false)
    expect(isValidScore(undefined)).toBe(false)
  })
})

describe('isValidClientId', () => {
  it('accepts a crypto.randomUUID-shaped id', () => {
    expect(isValidClientId('3f1a9c2e-7b4d-4e1a-9c2e-7b4d4e1a9c2e')).toBe(true)
  })
  it('rejects empty, too-short, too-long, or unsafe-charset ids', () => {
    expect(isValidClientId('')).toBe(false)
    expect(isValidClientId('short')).toBe(false)
    expect(isValidClientId('x'.repeat(65))).toBe(false)
    expect(isValidClientId('has spaces!!')).toBe(false)
    expect(isValidClientId(42)).toBe(false)
  })
})

describe('CITY_TZ', () => {
  it('covers exactly the five live cities', () => {
    expect(Object.keys(CITY_TZ).sort()).toEqual([
      'annarbor',
      'chicago',
      'seattle',
      'statecollege',
      'stpete',
    ])
  })
})

describe('isValidDateKey', () => {
  it('accepts a real date, rejects bad format and impossible dates', () => {
    expect(isValidDateKey('2026-06-15')).toBe(true)
    expect(isValidDateKey('2026-6-15')).toBe(false)
    expect(isValidDateKey('2026-99-99')).toBe(false)
    expect(isValidDateKey('not-a-date')).toBe(false)
  })
})

describe('validateView', () => {
  it('accepts a known city + valid date (any day — read-only)', () => {
    expect(validateView({ city: 'seattle', date: '2020-01-01' })).toEqual({
      ok: true,
      value: { city: 'seattle', date: '2020-01-01' },
    })
  })
  it('rejects an unknown city', () => {
    expect(
      validateView({ city: 'atlantis', date: '2026-06-15' }),
    ).toMatchObject({ ok: false, error: 'unknown city' })
  })
  it('rejects a malformed date', () => {
    expect(validateView({ city: 'seattle', date: 'nope' })).toMatchObject({
      ok: false,
      error: 'invalid date',
    })
  })
})

describe('cutoffDateKey', () => {
  it('is RETENTION_DAYS before now (keep boundary, exclusive)', () => {
    // 2026-06-15 minus 90 days = 2026-03-17.
    expect(cutoffDateKey(new Date('2026-06-15T12:00:00Z'))).toBe('2026-03-17')
  })
  it('honors a custom window', () => {
    expect(cutoffDateKey(new Date('2026-06-15T12:00:00Z'), 1)).toBe(
      '2026-06-14',
    )
  })
  it('defaults to a 90-day horizon', () => {
    expect(RETENTION_DAYS).toBe(90)
  })
})

describe('previousDateKey', () => {
  it('returns the prior calendar day (handles month/leap boundaries)', () => {
    expect(previousDateKey('2026-06-15')).toBe('2026-06-14')
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28')
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29') // leap year
  })
})

describe('advanceStreak', () => {
  it('starts a new streak at 1 when there is no prior row', () => {
    expect(advanceStreak(null, '2026-06-15')).toEqual({
      current: 1,
      best: 1,
      last_played_date: '2026-06-15',
    })
  })
  it('increments when the prior play was yesterday', () => {
    const prev = { current: 3, best: 5, last_played_date: '2026-06-14' }
    expect(advanceStreak(prev, '2026-06-15')).toMatchObject({
      current: 4,
      best: 5,
    })
  })
  it('sets a new best when the streak passes it', () => {
    const prev = { current: 5, best: 5, last_played_date: '2026-06-14' }
    expect(advanceStreak(prev, '2026-06-15')).toMatchObject({
      current: 6,
      best: 6,
    })
  })
  it('resets to 1 after a gap', () => {
    const prev = { current: 9, best: 9, last_played_date: '2026-06-10' }
    expect(advanceStreak(prev, '2026-06-15')).toMatchObject({
      current: 1,
      best: 9,
    })
  })
  it('is a no-op on same-day replay (keeps current)', () => {
    const prev = { current: 4, best: 7, last_played_date: '2026-06-15' }
    expect(advanceStreak(prev, '2026-06-15')).toMatchObject({
      current: 4,
      best: 7,
    })
  })
})

describe('validateSubmission', () => {
  const now = new Date('2026-06-15T16:00:00Z') // afternoon Eastern
  const today = dateKeyFor(now, 'America/New_York')

  it('accepts a well-formed submission for a known city + today', () => {
    const r = validateSubmission(
      {
        city: 'stpete',
        date: today,
        score: 420,
        clientId: '3f1a9c2e-7b4d-4e1a-9c2e-7b4d4e1a9c2e',
      },
      now,
    )
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({
      city: 'stpete',
      date: today,
      score: 420,
      clientId: '3f1a9c2e-7b4d-4e1a-9c2e-7b4d4e1a9c2e',
      lineup: '', // absent in payload → legacy '' bucket
    })
  })

  it('carries a well-formed lineup hash when provided', () => {
    const r = validateSubmission(
      {
        city: 'stpete',
        date: today,
        score: 420,
        clientId: 'a'.repeat(12),
        lineup: '1a2b3c',
      },
      now,
    )
    expect(r.ok).toBe(true)
    expect(r.value.lineup).toBe('1a2b3c')
  })

  it('rejects a malformed lineup', () => {
    const r = validateSubmission(
      {
        city: 'stpete',
        date: today,
        score: 1,
        clientId: 'a'.repeat(12),
        lineup: 'NOT/A/HASH',
      },
      now,
    )
    expect(r).toMatchObject({ ok: false, error: 'invalid lineup' })
  })

  // REGRESSION (the bug this guards both sides of): a client that stringified a
  // negative 32-bit hash sent a leading-'-' lineup, which this rejected with 400
  // — silently dropping the score. The client now coerces to unsigned
  // (progress.ts:lineupHash), but pin the server contract so a future regex
  // "simplification" that allowed '-' can't reopen the hole unnoticed.
  it("rejects a leading-'-' lineup (negative-hash regression)", () => {
    const r = validateSubmission(
      {
        city: 'stpete',
        date: today,
        score: 250,
        clientId: 'a'.repeat(12),
        lineup: '-z9cl16',
      },
      now,
    )
    expect(r).toMatchObject({ ok: false, error: 'invalid lineup' })
  })

  it('rejects an unknown city', () => {
    const r = validateSubmission(
      { city: 'atlantis', date: today, score: 1, clientId: 'a'.repeat(12) },
      now,
    )
    expect(r).toMatchObject({ ok: false, status: 400, error: 'unknown city' })
  })

  it('rejects a date outside the ±1-day window (no seeding past/future days)', () => {
    const r = validateSubmission(
      {
        city: 'stpete',
        date: '2020-01-01',
        score: 1,
        clientId: 'a'.repeat(12),
      },
      now,
    )
    expect(r).toMatchObject({ ok: false, error: 'date out of range' })
  })

  it('rejects an out-of-range score', () => {
    const r = validateSubmission(
      { city: 'stpete', date: today, score: 9999, clientId: 'a'.repeat(12) },
      now,
    )
    expect(r).toMatchObject({ ok: false, error: 'invalid score' })
  })

  it('rejects a malformed clientId', () => {
    const r = validateSubmission(
      { city: 'stpete', date: today, score: 1, clientId: 'nope!' },
      now,
    )
    expect(r).toMatchObject({ ok: false, error: 'invalid clientId' })
  })
})
