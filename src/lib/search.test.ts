import { describe, it, expect } from 'vitest'
import { searchLocations, isIncluded } from './search'
import type { Location } from '../types'

const loc = (name: string): Location => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  lat: 27.77,
  lng: -82.63,
  category: 'restaurant',
  source: 'overpass',
  attribution: 't',
})

const data = [
  loc('Brick & Mortar'),
  loc('The Mill'),
  loc('Mandarin Hide'),
  loc('Bandit Coffee'),
  loc('Bar Mezzo'),
]

describe('searchLocations', () => {
  it('returns [] for queries under 2 chars', () => {
    expect(searchLocations(data, '')).toEqual([])
    expect(searchLocations(data, 'b')).toEqual([])
  })

  it('matches case-insensitively on substring', () => {
    const names = searchLocations(data, 'bar').map((l) => l.name)
    expect(names).toContain('Bar Mezzo')
  })

  it('ranks prefix matches before mid-string matches', () => {
    const names = searchLocations(data, 'ba').map((l) => l.name)
    // "Bandit"/"Bar" start with "ba" → before "Brick & Mortar" (no) ...
    expect(names[0]).toMatch(/^Ba/)
  })

  it('respects the limit', () => {
    expect(searchLocations(data, 'a', 2).length).toBeLessThanOrEqual(2)
  })
})

describe('isIncluded', () => {
  it('is true for an exact (normalized) name match', () => {
    expect(isIncluded(data, 'brick & mortar')).toBe(true)
    expect(isIncluded(data, '  Brick  &  Mortar ')).toBe(true)
  })

  it('is false when absent', () => {
    expect(isIncluded(data, 'My Rich Uncle')).toBe(false)
  })
})
