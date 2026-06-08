import { describe, it, expect } from 'vitest'
import {
  isNotable,
  toLocation,
  buildOverpassQuery,
  poiLocationsFromElements,
} from './fetch-pois.mjs'

const el = (tags, lat = 40.8, lon = -77.85) => ({
  type: 'node',
  lat,
  lon,
  tags,
})

describe('parks are notable without a wiki link', () => {
  it('keeps a plain leisure=park with a name (no wikipedia/wikidata)', () => {
    expect(isNotable(el({ name: 'Orchard Park', leisure: 'park' }))).toBe(true)
  })

  it('keeps nature_reserve, garden, dog_park, recreation_ground', () => {
    for (const leisure of [
      'nature_reserve',
      'garden',
      'dog_park',
      'recreation_ground',
    ]) {
      expect(isNotable(el({ name: `X ${leisure}`, leisure })), leisure).toBe(
        true,
      )
    }
  })

  it('still drops an unnamed park', () => {
    expect(isNotable(el({ leisure: 'park' }))).toBe(false)
  })

  it('still applies the name denylist even to parks', () => {
    expect(
      isNotable(el({ name: 'U-Haul Storage Park', leisure: 'park' })),
    ).toBe(false)
  })
})

describe('green-space categories map to "park"', () => {
  for (const leisure of [
    'park',
    'nature_reserve',
    'garden',
    'dog_park',
    'recreation_ground',
  ]) {
    it(`leisure=${leisure} → category park`, () => {
      const loc = toLocation(el({ name: `X ${leisure}`, leisure }))
      expect(loc.category).toBe('park')
    })
  }
})

describe('the Overpass query requests green spaces', () => {
  it('includes park and the extra green-space leisure types', () => {
    const q = buildOverpassQuery([40.77, -77.9, 40.82, -77.81])
    for (const t of [
      'park',
      'nature_reserve',
      'garden',
      'dog_park',
      'recreation_ground',
    ]) {
      expect(q.includes(t), t).toBe(true)
    }
  })
})

describe('poiLocationsFromElements keeps named parks', () => {
  it('includes a wiki-less park in the output', () => {
    const out = poiLocationsFromElements([
      el({ name: 'Tom Tudek Memorial Park', leisure: 'park' }),
      el({ name: 'Some Restaurant', amenity: 'restaurant' }), // not notable (no wiki)
    ])
    expect(out.map((l) => l.name)).toContain('Tom Tudek Memorial Park')
    expect(out.map((l) => l.name)).not.toContain('Some Restaurant')
  })
})
