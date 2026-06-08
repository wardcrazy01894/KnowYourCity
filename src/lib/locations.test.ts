import { describe, it, expect } from 'vitest'
import type { LocationsFile } from '../types'
import { ROUNDS_PER_DAY, selectDailyLocations } from './daily'
import { CITIES } from './cities'
import stpete from '../../public/locations.stpete.json'
import statecollege from '../../public/locations.statecollege.json'
import annarbor from '../../public/locations.annarbor.json'
import seattle from '../../public/locations.seattle.json'
import chicago from '../../public/locations.chicago.json'

const DATASETS: Record<string, LocationsFile> = {
  stpete: stpete as unknown as LocationsFile,
  statecollege: statecollege as unknown as LocationsFile,
  annarbor: annarbor as unknown as LocationsFile,
  seattle: seattle as unknown as LocationsFile,
  chicago: chicago as unknown as LocationsFile,
}

const FOOD = new Set(['cafe', 'restaurant', 'bar'])
const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])

describe('city/dataset registry sync', () => {
  it('every city in cities.json has a bundled dataset (and vice versa)', () => {
    expect(Object.keys(DATASETS).sort()).toEqual(CITIES.map((c) => c.id).sort())
  })
})

for (const city of CITIES) {
  describe(`dataset: ${city.id}`, () => {
    const data = DATASETS[city.id]

    it('exists and has at least a full day of locations', () => {
      expect(data, `no dataset bundled for ${city.id}`).toBeTruthy()
      expect(data.locations.length).toBeGreaterThanOrEqual(ROUNDS_PER_DAY)
    })

    it('has unique ids', () => {
      const ids = data.locations.map((l) => l.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('every location is inside the city bounds with finite coords', () => {
      const [[s, w], [n, e]] = city.bounds
      for (const l of data.locations) {
        expect(Number.isFinite(l.lat) && Number.isFinite(l.lng)).toBe(true)
        expect(l.lat, `${l.name} lat`).toBeGreaterThanOrEqual(s)
        expect(l.lat, `${l.name} lat`).toBeLessThanOrEqual(n)
        expect(l.lng, `${l.name} lng`).toBeGreaterThanOrEqual(w)
        expect(l.lng, `${l.name} lng`).toBeLessThanOrEqual(e)
        expect(l.id && l.name).toBeTruthy()
      }
    })

    it('has an attribution string', () => {
      expect(data.attribution).toBeTruthy()
    })

    const withDifficulty = data.locations.filter(
      (l) => l.difficulty != null,
    ).length
    // Match the runtime predicate (daily.ts: `all.every(l => l.difficulty != null)`)
    // exactly: a city is "enriched" only when EVERY location carries a difficulty.
    const enriched = withDifficulty === data.locations.length

    it('difficulty is all-or-nothing across the dataset', () => {
      // A partially-enriched file would silently fall back to the legacy category
      // plan in production (daily.ts uses `.every()`), so the difficulty data
      // would be ignored without warning. Fail loudly instead.
      expect(
        withDifficulty === 0 || withDifficulty === data.locations.length,
        `${city.id}: ${withDifficulty}/${data.locations.length} locations have a difficulty — must be all or none`,
      ).toBe(true)
    })

    it('difficulty, when used, is present and valid on every location', () => {
      if (!enriched) return // city not yet run through the fame pass
      for (const l of data.locations) {
        expect(
          DIFFICULTIES.has(l.difficulty as string),
          `${l.name} difficulty=${l.difficulty}`,
        ).toBe(true)
      }
    })

    it('fills a valid daily plan across dates', () => {
      for (const dateKey of ['2026-06-06', '2026-09-01', '2026-12-25']) {
        const picks = selectDailyLocations(
          data.locations,
          `${city.id}:${dateKey}`,
        )
        expect(picks).toHaveLength(5)
        expect(new Set(picks.map((p) => p.id)).size).toBe(5)
        if (enriched) {
          // Difficulty plan: two easy, two medium, one hard.
          expect(picks.map((p) => p.difficulty)).toEqual([
            'easy',
            'easy',
            'medium',
            'medium',
            'hard',
          ])
        } else {
          // Legacy category plan: cafe → restaurant → bar → landmark → wildcard.
          expect(picks[0].category).toBe('cafe')
          expect(picks[1].category).toBe('restaurant')
          expect(picks[2].category).toBe('bar')
          expect(FOOD.has(picks[3].category)).toBe(false)
        }
      }
    })
  })
}
