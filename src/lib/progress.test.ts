import { describe, it, expect } from 'vitest'
import {
  lineupHash,
  bumpStreak,
  previousDateKey,
  recordCompletion,
  type Streak,
} from './progress'
import type { DayRecord, Location } from '../types'

const loc = (id: string): Location => ({
  id,
  name: id,
  lat: 27.77,
  lng: -82.63,
  category: 'attraction',
  source: 'manual',
  attribution: 'test',
})
const lineup = (ids: string[]) => ids.map(loc)

describe('previousDateKey', () => {
  it('returns the day before, UTC-safe across month boundaries', () => {
    expect(previousDateKey('2026-06-16')).toBe('2026-06-15')
    expect(previousDateKey('2026-07-01')).toBe('2026-06-30')
  })
})

describe('lineupHash', () => {
  it('is stable for the same ids in the same order', () => {
    expect(lineupHash(lineup(['a', 'b', 'c']))).toBe(
      lineupHash(lineup(['a', 'b', 'c'])),
    )
  })

  it('differs when the lineup differs (changed set or order)', () => {
    const base = lineupHash(lineup(['a', 'b', 'c']))
    expect(lineupHash(lineup(['a', 'b', 'd']))).not.toBe(base)
    expect(lineupHash(lineup(['c', 'b', 'a']))).not.toBe(base)
  })
})

describe('bumpStreak', () => {
  const base: Streak = { current: 3, best: 5, lastPlayedDateKey: '2026-06-15' }

  it('increments on a consecutive day', () => {
    expect(bumpStreak(base, '2026-06-16')).toEqual({
      current: 4,
      best: 5,
      lastPlayedDateKey: '2026-06-16',
    })
  })

  it('is a no-op when replaying the same day (binary "played")', () => {
    expect(bumpStreak(base, '2026-06-15')).toEqual({
      current: 3,
      best: 5,
      lastPlayedDateKey: '2026-06-15',
    })
  })

  it('resets to 1 after a gap', () => {
    expect(bumpStreak(base, '2026-06-18').current).toBe(1)
  })
})

describe('recordCompletion', () => {
  const fresh: Streak = { current: 0, best: 0, lastPlayedDateKey: null }
  const results = [{ distanceMeters: 100, score: 90 }]
  const done = (dateKey: string, lineupId: string, totalScore: number) => ({
    dateKey,
    lineup: lineupId,
    totalScore,
    results,
  })

  it('appends a record and bumps the streak on the first completion of a day', () => {
    const { history, streak } = recordCompletion(
      [],
      fresh,
      done('2026-06-16', 'A', 420),
    )
    expect(history).toEqual([
      { dateKey: '2026-06-16', totalScore: 420, results, lineup: 'A' },
    ])
    expect(streak).toMatchObject({
      current: 1,
      lastPlayedDateKey: '2026-06-16',
    })
  })

  it('is a no-op when the same (date, lineup) completion is recorded again', () => {
    const first = recordCompletion([], fresh, done('2026-06-16', 'A', 420))
    const again = recordCompletion(
      first.history,
      first.streak,
      done('2026-06-16', 'A', 999),
    )
    expect(again.history).toHaveLength(1)
    expect(again.history[0].totalScore).toBe(420) // original kept
    expect(again.streak).toEqual(first.streak)
  })

  // The core of the two-records behavior: a replay against a CHANGED lineup adds
  // a SECOND record (both kept), but does NOT bump the streak again — a calendar
  // date counts once no matter how many lineups are played.
  it('adds a second record for a changed lineup without re-bumping the streak', () => {
    const first = recordCompletion([], fresh, done('2026-06-16', 'A', 420))
    const second = recordCompletion(
      first.history,
      first.streak,
      done('2026-06-16', 'B', 380),
    )
    expect(second.history).toHaveLength(2)
    expect(second.history.map((h: DayRecord) => h.totalScore)).toEqual([
      420, 380,
    ])
    expect(second.history.map((h: DayRecord) => h.lineup)).toEqual(['A', 'B'])
    expect(second.streak).toEqual(first.streak) // unchanged — same date
  })

  // Migration: a record written before `lineup` existed has no lineup field. A
  // changed-lineup replay must still append a new record (the legacy record's
  // undefined lineup can't match a real hash) WITHOUT re-bumping the streak.
  it('appends past a legacy (lineup-less) record without re-bumping the streak', () => {
    const legacy: DayRecord = {
      dateKey: '2026-06-16',
      totalScore: 420,
      results,
    }
    const played: Streak = {
      current: 2,
      best: 4,
      lastPlayedDateKey: '2026-06-16',
    }
    const { history, streak } = recordCompletion(
      [legacy],
      played,
      done('2026-06-16', 'B', 380),
    )
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({ totalScore: 380, lineup: 'B' })
    expect(streak).toEqual(played) // date already played — no bump
  })
})
