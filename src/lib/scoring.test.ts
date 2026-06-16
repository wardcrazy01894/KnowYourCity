import { describe, it, expect } from 'vitest'
import {
  haversineMeters,
  scoreForDistance,
  scoreGuess,
  formatDistance,
  isLargeFootprintCategory,
  MAX_ROUND_SCORE,
  PERFECT_RADIUS_M,
  POINT_PERFECT_RADIUS_M,
  LARGE_FALLBACK_RADIUS_M,
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

describe('scoreForDistance with an explicit perfect radius', () => {
  it('uses the passed radius as the full-marks threshold', () => {
    expect(scoreForDistance(100, POINT_PERFECT_RADIUS_M)).toBe(MAX_ROUND_SCORE)
    expect(
      scoreForDistance(POINT_PERFECT_RADIUS_M, POINT_PERFECT_RADIUS_M),
    ).toBe(MAX_ROUND_SCORE)
    // Just past the tight point radius → less than full marks.
    expect(
      scoreForDistance(POINT_PERFECT_RADIUS_M + 50, POINT_PERFECT_RADIUS_M),
    ).toBeLessThan(MAX_ROUND_SCORE)
  })

  it('with radius 0, falloff starts at the edge — no flat freebie ring', () => {
    // Exactly at the edge → full marks.
    expect(scoreForDistance(0, 0)).toBe(MAX_ROUND_SCORE)
    // A meaningful distance outside is already below full marks (vs. the 300m
    // default which would still award 100 here).
    expect(scoreForDistance(100, 0)).toBeLessThan(MAX_ROUND_SCORE)
    expect(scoreForDistance(100, 0)).toBeGreaterThan(0)
    expect(scoreForDistance(100, PERFECT_RADIUS_M)).toBe(MAX_ROUND_SCORE)
  })
})

describe('isLargeFootprintCategory', () => {
  it('is true for park and golf_course', () => {
    expect(isLargeFootprintCategory('park')).toBe(true)
    expect(isLargeFootprintCategory('golf_course')).toBe(true)
  })
  it('is false for ordinary point categories', () => {
    for (const c of [
      'restaurant',
      'bar',
      'cafe',
      'museum',
      'attraction',
    ] as const) {
      expect(isLargeFootprintCategory(c)).toBe(false)
    }
  })
})

describe('scoreGuess', () => {
  const point: Location = {
    id: 'x',
    name: 'X',
    lat: 27.77,
    lng: -82.63,
    category: 'attraction',
    source: 'manual',
    attribution: 't',
  }
  // Distance helpers: ~0.001° latitude ≈ 111 m at this latitude.
  const northOf = (
    loc: Location,
    meters: number,
  ): { lat: number; lng: number } => ({
    lat: loc.lat + meters / 111_320,
    lng: loc.lng,
  })

  it('returns full score for an exact guess (point location)', () => {
    const { distanceMeters, score } = scoreGuess(point, {
      lat: 27.77,
      lng: -82.63,
    })
    expect(distanceMeters).toBeCloseTo(0, 3)
    expect(score).toBe(MAX_ROUND_SCORE)
  })

  describe('branch 4: point + normal category (tight radius)', () => {
    it('is the tightened 100 m value, not the old 300 m default', () => {
      // Pin the constant: changing it (e.g. back to 130/300) must be a
      // deliberate edit that breaks this test, not a silent drift.
      expect(POINT_PERFECT_RADIUS_M).toBe(100)
      expect(POINT_PERFECT_RADIUS_M).toBeLessThan(PERFECT_RADIUS_M)
    })
    it('full marks within POINT_PERFECT_RADIUS_M', () => {
      // ~50 m away, well inside the 100 m freebie.
      expect(scoreGuess(point, northOf(point, 50)).score).toBe(MAX_ROUND_SCORE)
    })
    it('full marks at exactly the radius, below full marks past it', () => {
      // At the radius itself → still MAX (boundary is inclusive).
      expect(
        scoreGuess(point, northOf(point, POINT_PERFECT_RADIUS_M)).score,
      ).toBe(MAX_ROUND_SCORE)
      // 150 m is unambiguously past the 100 m radius (Math.round only masks the
      // first ~25 m). The OLD 300 m radius would still award full marks here —
      // so this test would fail if the radius hadn't actually been tightened.
      expect(scoreGuess(point, northOf(point, 150)).score).toBeLessThan(
        MAX_ROUND_SCORE,
      )
      expect(scoreForDistance(150, PERFECT_RADIUS_M)).toBe(MAX_ROUND_SCORE)
    })
    it('less than full marks beyond POINT_PERFECT_RADIUS_M', () => {
      // ~250 m away, outside the 100 m point radius.
      const { score } = scoreGuess(point, northOf(point, 250))
      expect(score).toBeLessThan(MAX_ROUND_SCORE)
      expect(score).toBeGreaterThan(0)
    })
  })

  describe('branch 3: large-footprint category with NO polygon (300m fallback)', () => {
    const park: Location = { ...point, category: 'park' }
    it('still full marks at 250 m (covered by LARGE_FALLBACK_RADIUS_M)', () => {
      expect(LARGE_FALLBACK_RADIUS_M).toBeGreaterThan(POINT_PERFECT_RADIUS_M)
      expect(scoreGuess(park, northOf(park, 250)).score).toBe(MAX_ROUND_SCORE)
    })
    it('a normal point at the same 250 m would NOT be full marks', () => {
      expect(scoreGuess(point, northOf(point, 250)).score).toBeLessThan(
        MAX_ROUND_SCORE,
      )
    })
  })

  describe('polygon branches', () => {
    // ~1.1 km square centered on the location centroid (open ring).
    const polyLoc: Location = {
      ...point,
      category: 'park',
      polygon: [
        [27.775, -82.635],
        [27.775, -82.625],
        [27.765, -82.625],
        [27.765, -82.635],
      ],
    }

    it('branch 1: a guess inside the polygon scores 100 with 0 distance', () => {
      const { distanceMeters, score } = scoreGuess(polyLoc, {
        lat: 27.77,
        lng: -82.63,
      })
      expect(distanceMeters).toBe(0)
      expect(score).toBe(MAX_ROUND_SCORE)
    })

    it('branch 2: a guess just outside the polygon is below full marks (no freebie ring)', () => {
      // ~110 m north of the north edge (27.775).
      const { distanceMeters, score } = scoreGuess(polyLoc, {
        lat: 27.776,
        lng: -82.63,
      })
      expect(distanceMeters).toBeGreaterThan(0)
      expect(score).toBeLessThan(MAX_ROUND_SCORE)
      expect(score).toBeGreaterThan(0)
    })

    it('branch 2: distanceMeters is the edge distance, not the centroid distance', () => {
      // A guess far north: centroid is ~600m, but the edge is closer.
      const guess = { lat: 27.78, lng: -82.63 }
      const { distanceMeters } = scoreGuess(polyLoc, guess)
      const centroidDist = haversineMeters(guess, {
        lat: polyLoc.lat,
        lng: polyLoc.lng,
      })
      expect(distanceMeters).toBeLessThan(centroidDist)
    })
  })
})

describe('formatDistance', () => {
  it('uses meters under 1 km and km above', () => {
    expect(formatDistance(180)).toBe('180 m')
    expect(formatDistance(2400)).toBe('2.4 km')
  })
})
