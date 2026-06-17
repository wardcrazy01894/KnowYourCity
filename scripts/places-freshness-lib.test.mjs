import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  nameSimilarity,
  classifyVenue,
  driftFlag,
  shouldAutoClose,
} from './places-freshness-lib.mjs'

describe('normalizeName', () => {
  it('lowercases, drops punctuation/accents, expands &, collapses space', () => {
    expect(normalizeName("Mike's Café & Bar")).toBe('mikes cafe and bar')
    expect(normalizeName('  The   Pink   Door  ')).toBe('the pink door')
  })
})

describe('nameSimilarity', () => {
  it('is 1 for identical names', () => {
    expect(nameSimilarity('Canlis', 'Canlis')).toBe(1)
  })
  it('ignores leading stopwords ("The Pink Door" ~ "Pink Door")', () => {
    expect(nameSimilarity('The Pink Door', 'Pink Door')).toBe(1)
  })
  it('is high for a close match, low for a different business', () => {
    expect(
      nameSimilarity('Serious Pie Ballard', 'Serious Pie'),
    ).toBeGreaterThan(0.6)
    expect(nameSimilarity('Canlis', 'Dick’s Drive-In')).toBeLessThan(0.3)
  })
})

describe('classifyVenue', () => {
  const v = { name: 'Canlis', lat: 47.6431, lng: -122.3468 }

  it('not_found when there is no candidate', () => {
    const r = classifyVenue(v, null)
    expect(r.verdict).toBe('not_found')
    expect(r.action).toBe('review')
  })

  it('stamps a confidently-matched operational place', () => {
    const r = classifyVenue(v, {
      businessStatus: 'OPERATIONAL',
      displayName: 'Canlis',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.verdict).toBe('operational')
    expect(r.action).toBe('stamp')
    expect(r.matched).toBe(true)
    expect(r.distanceM).toBeLessThan(50)
  })

  it('treats a missing businessStatus as operational', () => {
    const r = classifyVenue(v, {
      displayName: 'Canlis',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.action).toBe('stamp')
    expect(r.businessStatus).toBe('OPERATIONAL')
  })

  it('marks a confidently-matched closed place for closure', () => {
    const r = classifyVenue(v, {
      businessStatus: 'CLOSED_PERMANENTLY',
      displayName: 'Canlis',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.verdict).toBe('closed')
    expect(r.action).toBe('close')
  })

  it('watch-lists a temporarily-closed place (no stamp)', () => {
    const r = classifyVenue(v, {
      businessStatus: 'CLOSED_TEMPORARILY',
      displayName: 'Canlis',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.verdict).toBe('temp_closed')
    expect(r.action).toBe('watch')
  })

  it('flags a different name at the location as ambiguous (no auto-close/rename)', () => {
    const r = classifyVenue(v, {
      businessStatus: 'OPERATIONAL',
      displayName: 'Some Totally Different Eatery',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.verdict).toBe('ambiguous')
    expect(r.action).toBe('review')
  })

  it('flags a far-away same-name match as ambiguous (geocoding miss)', () => {
    const r = classifyVenue(v, {
      businessStatus: 'OPERATIONAL',
      displayName: 'Canlis',
      lat: 47.9,
      lng: -122.1,
    })
    expect(r.matched).toBe(false)
    expect(r.verdict).toBe('ambiguous')
  })

  it('a closed but unmatched candidate does NOT auto-close', () => {
    const r = classifyVenue(v, {
      businessStatus: 'CLOSED_PERMANENTLY',
      displayName: 'Unrelated Place',
      lat: 47.6431,
      lng: -122.3468,
    })
    expect(r.verdict).toBe('ambiguous')
    expect(r.action).toBe('review')
  })
})

describe('shouldAutoClose', () => {
  it('auto-closes only food/drink business categories', () => {
    expect(shouldAutoClose('restaurant')).toBe(true)
    expect(shouldAutoClose('cafe')).toBe(true)
    expect(shouldAutoClose('bar')).toBe(true)
  })
  it('never auto-closes parks/landmarks/etc (POI delistings, not real closures)', () => {
    for (const c of [
      'park',
      'landmark',
      'attraction',
      'museum',
      'plaza',
      'golf_course',
      'venue',
      'other',
    ])
      expect(shouldAutoClose(c)).toBe(false)
    expect(shouldAutoClose(undefined)).toBe(false)
  })
})

describe('driftFlag', () => {
  it('returns null for small or low-volume changes', () => {
    expect(driftFlag(100, 110)).toBeNull()
    expect(driftFlag(5, 40)).toBeNull() // new below minNew
  })
  it('flags a large jump on a non-trivial count', () => {
    const f = driftFlag(100, 400)
    expect(f).not.toBeNull()
    expect(f.ratio).toBe(4)
  })
  it('flags a large drop', () => {
    expect(driftFlag(1000, 200)).not.toBeNull()
  })
  it('handles a previously-unknown count (0/undefined)', () => {
    expect(driftFlag(0, 500)).not.toBeNull()
    expect(driftFlag(undefined, 500)).not.toBeNull()
  })
})
