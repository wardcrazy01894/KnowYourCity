import { describe, expect, it } from 'vitest'
import { findMissingNearby, poisFromElements } from './nearby-sweep.mjs'

// ~0.00135° lat ≈ 150m; the test grid keeps everything near (27.771, -82.637).
const CENTER = { lat: 27.771, lng: -82.637 }

const dataset = [
  { id: 'saigon-blonde', name: 'Saigon Blonde', lat: 27.7711, lng: -82.63705 },
  {
    id: 'moore-coffee',
    name: 'Moore Coffee St. Pete',
    lat: 27.77105,
    lng: -82.63695,
  },
  // Same name as a swept POI but ~3km away — a chain branch, not a match.
  { id: 'the-galley-far', name: 'The Galley', lat: 27.798, lng: -82.637 },
]

describe('findMissingNearby', () => {
  it('splits nearby POIs into present (name+proximity match) and missing', () => {
    const osmPois = [
      { name: 'Saigon Blonde', lat: 27.77112, lng: -82.63707 }, // in dataset
      { name: 'Brand New Bar', lat: 27.7712, lng: -82.6372 }, // missing
      { name: 'The Galley', lat: 27.7709, lng: -82.6368 }, // only far twin → missing
    ]
    const { present, missing } = findMissingNearby({
      dataset,
      osmPois,
      center: CENTER,
      radiusMeters: 160,
    })
    expect(present.map((p) => p.name)).toEqual(['Saigon Blonde'])
    expect(present[0].matchedTo).toBe('saigon-blonde')
    expect(missing.map((m) => m.name).sort()).toEqual([
      'Brand New Bar',
      'The Galley',
    ])
    expect(missing[0].distanceMeters).toBeGreaterThan(0)
  })

  it('ignores POIs outside the radius and de-dupes same-name POIs', () => {
    const osmPois = [
      { name: 'Way Out There', lat: 27.8, lng: -82.7 },
      { name: 'Twin Spot', lat: 27.7711, lng: -82.63705 },
      { name: 'Twin  Spot', lat: 27.77111, lng: -82.63706 },
    ]
    const { present, missing } = findMissingNearby({
      dataset,
      osmPois,
      center: CENTER,
      radiusMeters: 160,
    })
    expect(present).toEqual([])
    expect(missing.map((m) => m.name)).toEqual(['Twin Spot'])
  })

  it('strips city tokens before comparing names', () => {
    const osmPois = [{ name: 'Moore Coffee', lat: 27.77106, lng: -82.63696 }]
    const { present, missing } = findMissingNearby({
      dataset,
      osmPois,
      center: CENTER,
      radiusMeters: 160,
      cityTokens: ['st pete'],
    })
    expect(missing).toEqual([])
    expect(present[0].matchedTo).toBe('moore-coffee')
  })
})

describe('poisFromElements', () => {
  it('keeps named POI nodes/ways (center) and skips unnamed or untagged', () => {
    const elements = [
      {
        type: 'node',
        id: 1,
        lat: 27.77,
        lon: -82.63,
        tags: { name: 'A Bar', amenity: 'bar' },
      },
      {
        type: 'way',
        id: 2,
        center: { lat: 27.771, lon: -82.631 },
        tags: { name: 'A Museum', tourism: 'museum' },
      },
      { type: 'node', id: 3, lat: 27.7, lon: -82.6, tags: { amenity: 'bar' } },
      {
        type: 'node',
        id: 4,
        lat: 27.7,
        lon: -82.6,
        tags: { name: 'Just A Building' },
      },
    ]
    expect(poisFromElements(elements)).toEqual([
      { name: 'A Bar', lat: 27.77, lng: -82.63, kind: 'bar' },
      { name: 'A Museum', lat: 27.771, lng: -82.631, kind: 'museum' },
    ])
  })
})
