import { describe, it, expect } from 'vitest'
import type { LocationsFile } from '../types'
import { ROUNDS_PER_DAY } from './daily'
import curated from '../../public/locations.json'
import sample from '../../public/locations.sample.json'

// Mirror of ST_PETE_BOUNDS in src/components/Game.tsx. Kept inline so this test
// doesn't import the React/Leaflet module chain (Leaflet needs `window`).
// [[south, west], [north, east]]
const ST_PETE_BOUNDS: [[number, number], [number, number]] = [
  [27.62, -82.78],
  [27.86, -82.58],
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
