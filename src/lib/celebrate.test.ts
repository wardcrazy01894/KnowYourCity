import { describe, it, expect } from 'vitest'
import {
  countGreens,
  shouldCelebrate,
  CELEBRATION_MIN_GREENS,
} from './celebrate'
import type { RoundResult } from '../types'

function result(score: number): RoundResult {
  return {
    location: {
      id: String(score),
      name: 'X',
      lat: 0,
      lng: 0,
      category: 'attraction',
      source: 'manual',
      attribution: 't',
    },
    guess: { lat: 0, lng: 0 },
    distanceMeters: 0,
    score,
  }
}

describe('countGreens', () => {
  it('counts rounds at the green tier (score >= 80, incl. perfect 100)', () => {
    expect(countGreens([result(100), result(80), result(79), result(0)])).toBe(
      2,
    )
  })

  it('is 0 when nothing reaches green', () => {
    expect(countGreens([result(79), result(50), result(10)])).toBe(0)
  })
})

describe('shouldCelebrate', () => {
  it(`celebrates at ${CELEBRATION_MIN_GREENS}+ greens regardless of total`, () => {
    // 4 greens but a modest total (4×80 = 320, under 400) — greens alone qualify.
    const r = [result(80), result(80), result(80), result(80), result(0)]
    expect(shouldCelebrate(r, 320)).toBe(true)
  })

  it('does not celebrate with only 3 greens and total <= 400', () => {
    const r = [result(80), result(80), result(80), result(30), result(0)]
    expect(shouldCelebrate(r, 270)).toBe(false)
  })

  it('celebrates on total strictly over 400 even with few greens', () => {
    // One perfect + four near-misses can clear 400 without 4 greens.
    const r = [result(100), result(79), result(79), result(79), result(70)]
    expect(shouldCelebrate(r, 407)).toBe(true)
  })

  it('celebrates via the score branch with only 3 greens (total > 400)', () => {
    // 3 greens (under the green floor) but 3×100 + 2×60 = 420 clears 400.
    const r = [result(100), result(100), result(100), result(60), result(60)]
    expect(countGreens(r)).toBe(3)
    expect(shouldCelebrate(r, 420)).toBe(true)
  })

  it('does not celebrate at exactly 400 (must be over)', () => {
    const r = [result(79), result(79), result(79), result(79), result(84)]
    expect(shouldCelebrate(r, 400)).toBe(false)
  })

  it('does not celebrate on a weak day', () => {
    const r = [result(40), result(30), result(20), result(10), result(0)]
    expect(shouldCelebrate(r, 100)).toBe(false)
  })
})
