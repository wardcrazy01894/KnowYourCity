import { describe, it, expect } from 'vitest'
import type { LocationsFile } from '../types'
import { ROUNDS_PER_DAY, selectDailyLocations } from './daily'
import curated from '../../public/locations.json'
import sample from '../../public/locations.sample.json'

// Mirror of ST_PETE_BOUNDS in src/components/Game.tsx. Kept inline so this test
// doesn't import the React/Leaflet module chain (Leaflet needs `window`).
// [[south, west], [north, east]]
const ST_PETE_BOUNDS: [[number, number], [number, number]] = [
  [27.62, -82.8],
  [27.9, -82.58],
]

// Guard the shipped datasets so a bad curation can't merge.
const datasets: Array<[string, LocationsFile]> = [
  ['locations.json', curated as unknown as LocationsFile],
  ['locations.sample.json', sample as unknown as LocationsFile],
]

for (const [label, data] of datasets) {
  describe(`dataset ${label}`, () => {
    it('has at least one full day of locations', () => {
      expect(data.locations.length).toBeGreaterThanOrEqual(ROUNDS_PER_DAY)
    })

    it('has unique ids', () => {
      const ids = data.locations.map((l) => l.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('every location is inside the St. Pete play bounds', () => {
      const [[s, w], [n, e]] = ST_PETE_BOUNDS
      for (const l of data.locations) {
        expect(l.lat, `${l.name} lat`).toBeGreaterThanOrEqual(s)
        expect(l.lat, `${l.name} lat`).toBeLessThanOrEqual(n)
        expect(l.lng, `${l.name} lng`).toBeGreaterThanOrEqual(w)
        expect(l.lng, `${l.name} lng`).toBeLessThanOrEqual(e)
      }
    })

    it('every location has id, name, and finite coords', () => {
      for (const l of data.locations) {
        expect(l.id).toBeTruthy()
        expect(l.name).toBeTruthy()
        expect(Number.isFinite(l.lat)).toBe(true)
        expect(Number.isFinite(l.lng)).toBe(true)
      }
    })

    it('has an attribution string', () => {
      expect(data.attribution).toBeTruthy()
    })
  })
}

describe('curated dataset supports the daily category plan', () => {
  const curatedFile = curated as unknown as LocationsFile
  const FOOD = new Set(['cafe', 'restaurant', 'bar'])

  for (const dateKey of ['2026-06-06', '2026-07-01', '2026-12-25']) {
    it(`fills coffee/restaurant/bar/landmark/wildcard for ${dateKey}`, () => {
      const picks = selectDailyLocations(curatedFile.locations, dateKey)
      expect(picks).toHaveLength(5)
      expect(picks[0].category).toBe('cafe')
      expect(picks[1].category).toBe('restaurant')
      expect(picks[2].category).toBe('bar')
      expect(FOOD.has(picks[3].category)).toBe(false) // landmark = non-food
      expect(new Set(picks.map((p) => p.id)).size).toBe(5)
    })
  }
})
