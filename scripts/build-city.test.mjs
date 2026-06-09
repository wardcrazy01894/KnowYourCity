import { describe, it, expect } from 'vitest'
import { composeLocations } from './build-city.mjs'

const CITY = (target) => ({
  id: 't',
  name: 'Test',
  bounds: [
    [0, 0],
    [10, 10],
  ],
  target,
})

const lm = (id, signal = 0, lat = 5, lng = 5) => ({
  id,
  name: id,
  lat,
  lng,
  category: 'landmark',
  source: 'overpass',
  attribution: 'x',
  _signal: signal,
})
const food = (id, category, signal = 0, lat = 5, lng = 5) => ({
  id,
  name: id,
  lat,
  lng,
  category,
  source: 'overpass',
  attribution: 'x',
  _signal: signal,
})

describe('composeLocations', () => {
  it('caps to target when target is a number', () => {
    const landmarks = Array.from({ length: 20 }, (_, i) => lm(`lm${i}`))
    const f = Array.from({ length: 20 }, (_, i) => food(`r${i}`, 'restaurant'))
    const out = composeLocations({ landmarks, food: f, city: CITY(10) })
    expect(out.length).toBe(10)
  })

  it('returns ALL in-bounds deduped locations when target is null (uncapped)', () => {
    const landmarks = Array.from({ length: 20 }, (_, i) => lm(`lm${i}`))
    const f = Array.from({ length: 30 }, (_, i) => food(`r${i}`, 'restaurant'))
    const out = composeLocations({ landmarks, food: f, city: CITY(null) })
    expect(out.length).toBe(50)
  })

  it('treats missing target as uncapped', () => {
    const landmarks = [lm('a'), lm('b')]
    const out = composeLocations({ landmarks, food: [], city: CITY(undefined) })
    expect(out.length).toBe(2)
  })

  it('drops out-of-bounds entries', () => {
    const landmarks = [lm('in', 0, 5, 5), lm('out', 0, 99, 99)]
    const out = composeLocations({ landmarks, food: [], city: CITY(null) })
    expect(out.map((l) => l.id)).toEqual(['in'])
  })

  it('dedupes by id and by normalized name (same spot)', () => {
    const landmarks = [lm('dup'), lm('dup'), { ...lm('dup2'), name: 'DUP' }]
    const out = composeLocations({ landmarks, food: [], city: CITY(null) })
    expect(out.length).toBe(1)
  })

  it('KEEPS same-name locations that are far apart (genuine multi-location)', () => {
    // Two branches of the same business at distinct coords — must NOT collapse.
    const landmarks = [
      { ...lm('spud-a', 0, 1, 1), name: 'Spud Fish & Chips' },
      { ...lm('spud-b', 0, 9, 9), name: 'Spud Fish & Chips' },
    ]
    const out = composeLocations({ landmarks, food: [], city: CITY(null) })
    expect(out.map((l) => l.id).sort()).toEqual(['spud-a', 'spud-b'])
  })

  it('collapses a same-name pair within ~150m (alternate-slug double-listing)', () => {
    // ~89 m apart (0.0008° lat) — an OSM double-listing, keep the first (higher signal).
    const landmarks = [
      { ...lm('moore-a', 9, 5, 5), name: 'Moore Coffee' },
      { ...lm('moore-b', 0, 5.0008, 5), name: 'Moore Coffee' },
    ]
    const out = composeLocations({ landmarks, food: [], city: CITY(null) })
    expect(out.map((l) => l.id)).toEqual(['moore-a'])
  })

  it('collapses a trailing-city-token name variant within ~150m', () => {
    // "Moore Coffee" vs "Moore Coffee Seattle" ~89 m apart -> same business.
    const city = {
      id: 'sea',
      name: 'Seattle, WA',
      short: 'Seattle',
      bounds: [
        [0, 0],
        [10, 10],
      ],
      target: null,
    }
    const landmarks = [
      { ...lm('moore-coffee', 9, 5, 5), name: 'Moore Coffee' },
      {
        ...lm('moore-coffee-seattle', 0, 5.0008, 5),
        name: 'Moore Coffee Seattle',
      },
    ]
    const out = composeLocations({ landmarks, food: [], city })
    expect(out.map((l) => l.id)).toEqual(['moore-coffee'])
  })

  it('strips the internal _signal field from output', () => {
    const out = composeLocations({
      landmarks: [lm('a', 9)],
      food: [],
      city: CITY(null),
    })
    expect(out[0]._signal).toBeUndefined()
  })

  it('includes manual entries even past the cap, and de-dupes them', () => {
    const landmarks = Array.from({ length: 10 }, (_, i) => lm(`lm${i}`))
    const manual = [
      {
        id: 'must',
        name: 'Must Have',
        lat: 5,
        lng: 5,
        category: 'bar',
        source: 'manual',
        attribution: 'x',
      },
    ]
    const out = composeLocations({
      landmarks,
      food: [],
      manual,
      city: CITY(3),
    })
    expect(out.find((l) => l.id === 'must')).toBeTruthy()
    // 3 capped landmarks + 1 manual that bypassed the cap
    expect(out.length).toBe(4)
  })
})
