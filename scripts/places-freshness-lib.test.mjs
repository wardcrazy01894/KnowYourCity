import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  nameSimilarity,
  classifyVenue,
  classifyFromStored,
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
  it('treats abbreviation/ordinal/spacing variants as the same name', () => {
    expect(nameSimilarity('3rd Ave Cafe', 'Third Avenue Cafe')).toBe(1)
    expect(nameSimilarity('74th Street Alehouse', '74th St Ale House')).toBe(1)
    expect(nameSimilarity('AnNamPho', 'An Nam Pho')).toBe(1)
    expect(nameSimilarity('Boathouse Deli', 'Boat House Deli')).toBe(1)
  })
  it('scores a contained name high ("Agelgil" ⊂ "Agelgil Ethiopian Restaurant")', () => {
    expect(
      nameSimilarity('Agelgil', 'Agelgil Ethiopian Restaurant Seattle'),
    ).toBeGreaterThanOrEqual(0.9)
  })
  it('still scores two unrelated names low', () => {
    expect(nameSimilarity('Accidental Park', 'Occidental Square')).toBeLessThan(
      0.3,
    )
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

  it('a candidate with no coordinates is NOT matched (cannot confirm by location)', () => {
    const r = classifyVenue(v, {
      businessStatus: 'OPERATIONAL',
      displayName: 'Canlis',
    })
    expect(r.distanceM).toBeNull()
    expect(r.matched).toBe(false)
    expect(r.action).toBe('review')
  })

  it('a coordinate-less CLOSED_PERMANENTLY does NOT auto-close', () => {
    const r = classifyVenue(v, {
      businessStatus: 'CLOSED_PERMANENTLY',
      displayName: 'Canlis',
    })
    expect(r.verdict).toBe('ambiguous')
    expect(r.action).toBe('review')
  })

  it('stamps a near-coincident operational venue despite name-formatting noise', () => {
    // "3rd Ave Cafe" vs Google "Third Avenue Cafe" at ~8m — same place.
    const r = classifyVenue(
      { name: '3rd Ave Cafe', lat: 47.6431, lng: -122.3468, category: 'cafe' },
      {
        businessStatus: 'OPERATIONAL',
        displayName: 'Third Avenue Cafe',
        lat: 47.64312,
        lng: -122.3468,
      },
    )
    expect(r.action).toBe('stamp')
  })

  it('does NOT proximity-match a wholly different tenant at our pin', () => {
    const r = classifyVenue(
      { name: 'Canlis', lat: 47.6431, lng: -122.3468, category: 'restaurant' },
      {
        businessStatus: 'OPERATIONAL',
        displayName: 'Joe Random Vape Shop',
        lat: 47.6431,
        lng: -122.3468,
      },
    )
    expect(r.action).toBe('review')
  })

  it('never proximity-matches a closed venue (proximity is for confirming presence)', () => {
    const r = classifyVenue(
      { name: 'Canlis', lat: 47.6431, lng: -122.3468, category: 'restaurant' },
      {
        businessStatus: 'CLOSED_PERMANENTLY',
        displayName: 'Canlis',
        lat: 47.6431,
        lng: -122.3468,
      },
    )
    expect(r.verdict).toBe('closed') // still a normal matched closure, just not via proximity
    expect(r.action).toBe('close')
  })

  it('matches a same-name park whose centroid is past the business gate (big footprint)', () => {
    const r = classifyVenue(
      {
        name: 'Discovery Park',
        lat: 47.6573,
        lng: -122.4063,
        category: 'park',
      },
      {
        businessStatus: 'OPERATIONAL',
        displayName: 'Discovery Park',
        lat: 47.6606, // ~480m away — beyond the 400m business gate, within park slack
        lng: -122.4063,
      },
    )
    expect(r.matched).toBe(true)
    expect(r.action).toBe('stamp')
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

describe('classifyFromStored (offline reclassify, no re-fetch)', () => {
  it('proximity-stamps a near operational record despite name noise', () => {
    const rec = {
      id: 'x',
      candidateName: 'Third Avenue Cafe',
      distanceM: 8,
      businessStatus: 'OPERATIONAL',
    }
    const r = classifyFromStored(rec, {
      name: '3rd Ave Cafe',
      category: 'cafe',
    })
    expect(r.action).toBe('stamp')
  })
  it('leaves a far weak match as review', () => {
    const rec = {
      id: 'y',
      candidateName: 'Occidental Square',
      distanceM: 6772,
      businessStatus: 'OPERATIONAL',
    }
    const r = classifyFromStored(rec, {
      name: 'Accidental Park',
      category: 'park',
    })
    expect(r.action).toBe('review')
  })
  it('passes a NOT_FOUND record through as not_found/review', () => {
    const rec = {
      id: 'z',
      candidateName: null,
      businessStatus: 'NOT_FOUND',
      distanceM: null,
    }
    const r = classifyFromStored(rec, { name: 'Ghost Cafe', category: 'cafe' })
    expect(r.verdict).toBe('not_found')
    expect(r.action).toBe('review')
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
  it('honors the tighter thresholds places-apply.mjs passes ({minNew:500, ratio:3})', () => {
    const opts = { minNew: 500, ratio: 3 }
    expect(driftFlag(100, 400, opts)).toBeNull() // new 400 < minNew 500
    expect(driftFlag(300, 700, opts)).toBeNull() // 700>=500 but ratio 2.33 < 3
    expect(driftFlag(100, 600, opts)).not.toBeNull() // 600>=500 and ratio 6 >= 3
  })
})
