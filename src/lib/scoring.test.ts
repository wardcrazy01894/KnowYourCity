import { describe, it, expect } from 'vitest'
import {
  haversineMeters,
  scoreForDistance,
  scoreGuess,
  formatDistance,
  MAX_ROUND_SCORE,
  PERFECT_RADIUS_M,
  ZERO_DISTANCE_M,
} from './scoring'
import type { Location } from '../types'

describe('haversineMeters', () => {
  it('is ~0 for identical points', () => {
    expect(
      haversineMeters({ lat: 27.77, lng: -82.63 }, { lat: 27.77, lng: -82.63 }),
    ).toBeCloseTo(0, 5)
  })

  it('matches a known distance (St Pete Pier ↔ Dalí Museum ≈ 0.6 km)', () => {
    const d = haversineMeters(
      { lat: 27.7686, lng: -82.626 },
      { lat: 27.7657, lng: -82.6321 },
    )
    expect(d).toBeGreaterThan(500)
    expect(d).toBeLessThan(800)
  })

  it('one degree of latitude ≈ 111 km', () => {
    const d = haversineMeters({ lat: 27, lng: -82 }, { lat: 28, lng: -82 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })
})

describe('scoreForDistance', () => {
  it('awards full points within the perfect radius', () => {
    expect(scoreForDistance(0)).toBe(MAX_ROUND_SCORE)
    expect(scoreForDistance(PERFECT_RADIUS_M)).toBe(MAX_ROUND_SCORE)
  })

  it('awards zero at/after the zero distance', () => {
    expect(scoreForDistance(ZERO_DISTANCE_M)).toBe(0)
    expect(scoreForDistance(ZERO_DISTANCE_M + 5000)).toBe(0)
  })

  it('is on a 0-100 scale', () => {
    expect(MAX_ROUND_SCORE).toBe(100)
    expect(scoreForDistance(0)).toBe(100)
  })

  it('falls off linearly (midpoint distance ≈ half score)', () => {
    const mid = (PERFECT_RADIUS_M + ZERO_DISTANCE_M) / 2
    expect(scoreForDistance(mid)).toBe(50)
  })

  it('decreases monotonically with distance', () => {
    const samples = [150, 500, 1000, 1500, 2000, 2500].map(scoreForDistance)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1])
    }
  })

  it('stays within [0, MAX]', () => {
    for (const d of [-10, 0, 50, 1500, 12000, 99999]) {
      const s = scoreForDistance(d)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(MAX_ROUND_SCORE)
    }
  })
})

describe('scoreGuess', () => {
  const loc: Location = {
    id: 'x',
    name: 'X',
    lat: 27.77,
    lng: -82.63,
    category: 'attraction',
    source: 'manual',
    attribution: 't',
  }
  it('returns full score for an exact guess', () => {
    const { distanceMeters, score } = scoreGuess(loc, {
      lat: 27.77,
      lng: -82.63,
    })
    expect(distanceMeters).toBeCloseTo(0, 3)
    expect(score).toBe(MAX_ROUND_SCORE)
  })
})

describe('formatDistance', () => {
  it('uses meters under 1 km and km above', () => {
    expect(formatDistance(180)).toBe('180 m')
    expect(formatDistance(2400)).toBe('2.4 km')
  })
})
