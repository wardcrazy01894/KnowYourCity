import { describe, it, expect } from 'vitest'
import {
  fitFameCurve,
  fameFromReviews,
  resolveBranchName,
} from './add-chain-branches.mjs'

/**
 * Orchestration pins for add-chain-branches (scan M6): the fame calibration
 * and branch-naming/collision decisions previously lived only inside the
 * untested processCity body. A silent regression here mis-scores or
 * mis-names every added branch.
 */

describe('fitFameCurve + fameFromReviews', () => {
  // Perfect log-linear city: fame = 20*log10(reviews) + 10.
  const fame = [
    { status: 'open', isNationalChain: false, reviewCount: 10, fameScore: 30 },
    { status: 'open', isNationalChain: false, reviewCount: 100, fameScore: 50 },
    {
      status: 'open',
      isNationalChain: false,
      reviewCount: 1000,
      fameScore: 70,
    },
  ]

  it('recovers the city’s fame↔reviews curve from its own venues', () => {
    const fit = fitFameCurve(fame)
    expect(fameFromReviews(fit, 100)).toBe(50)
    expect(fameFromReviews(fit, 1000)).toBe(70)
  })

  it('excludes closed rows and national chains from the calibration', () => {
    const noisy = [
      ...fame,
      {
        status: 'closed',
        isNationalChain: false,
        reviewCount: 10,
        fameScore: 90,
      },
      {
        status: 'open',
        isNationalChain: true,
        reviewCount: 1000,
        fameScore: 5,
      },
    ]
    const fit = fitFameCurve(noisy)
    expect(fameFromReviews(fit, 100)).toBe(50) // unchanged by excluded rows
  })

  it('clamps to the 5..90 band (never a flagship score from reviews alone)', () => {
    const fit = fitFameCurve(fame)
    expect(fameFromReviews(fit, 10_000_000)).toBeLessThanOrEqual(90)
    // The floor needs a curve that actually dips below 5 at low review counts
    // (the calibration fit above evaluates to 10 at rc=1, which would let a
    // broken floor pass unnoticed).
    const steep = fitFameCurve([
      { status: 'open', isNationalChain: false, reviewCount: 10, fameScore: 2 },
      {
        status: 'open',
        isNationalChain: false,
        reviewCount: 1000,
        fameScore: 62,
      },
    ])
    expect(fameFromReviews(steep, 1)).toBe(5)
  })
})

describe('resolveBranchName', () => {
  const taken = {
    usedNames: new Set(['Bandit Coffee - Grand Central']),
    existingIds: new Set(['bandit-coffee-grand-central']),
  }

  it('names a clean branch "<brand> - <hood>"', () => {
    const r = resolveBranchName('Bandit Coffee', 'Old Northeast', null, taken)
    expect(r).toEqual({
      name: 'Bandit Coffee - Old Northeast',
      id: 'bandit-coffee-old-northeast',
    })
  })

  it('disambiguates a same-neighborhood collision with the street', () => {
    const r = resolveBranchName(
      'Bandit Coffee',
      'Grand Central',
      '1st Ave S',
      taken,
    )
    expect(r.name).toBe('Bandit Coffee - Grand Central (1st Ave S)')
    expect(r.id).toBe('bandit-coffee-grand-central-1st-ave-s')
  })

  it('returns null on a collision with no street (skip, never a dupe)', () => {
    expect(
      resolveBranchName('Bandit Coffee', 'Grand Central', null, taken),
    ).toBeNull()
  })

  it('returns null when even the street-form collides', () => {
    const t = {
      usedNames: new Set([
        'Bandit Coffee - Grand Central',
        'Bandit Coffee - Grand Central (1st Ave S)',
      ]),
      existingIds: new Set(),
    }
    expect(
      resolveBranchName('Bandit Coffee', 'Grand Central', '1st Ave S', t),
    ).toBeNull()
  })
})
