import { describe, it, expect } from 'vitest'
import { foodLocationsFromElements, RENAMED_IN_OSM } from './fetch-food.mjs'

// Helper: a minimal Overpass food element with an "established" signal (cuisine).
const el = (name, extra = {}) => ({
  tags: { name, amenity: 'restaurant', cuisine: 'latin', ...extra },
  lat: 27.82,
  lon: -82.67,
})

describe('RENAMED_IN_OSM filter', () => {
  it('drops the stale "La Carreta Bakery" OSM name (rebranded to Mi Carreta)', () => {
    // It carries a real establishment signal, so only the rename filter can drop it.
    const out = foodLocationsFromElements([el('La Carreta Bakery')])
    expect(out.find((l) => /carreta/i.test(l.name))).toBeUndefined()
  })

  it('keeps an unrelated established restaurant', () => {
    const out = foodLocationsFromElements([el('Brick & Mortar')])
    expect(out.some((l) => l.name === 'Brick & Mortar')).toBe(true)
  })

  it('does not false-positive on other "carreta" names', () => {
    expect(RENAMED_IN_OSM.test('La Carreta Bakery')).toBe(true)
    expect(RENAMED_IN_OSM.test('Carreta Mexican Grill')).toBe(false)
    expect(RENAMED_IN_OSM.test('Mi Carreta Restaurant and Bakery')).toBe(false)
  })
})
