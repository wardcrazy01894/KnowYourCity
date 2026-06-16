import { describe, it, expect } from 'vitest'
import type { LocationsFile } from '../types'
import { ROUNDS_PER_DAY, selectDailyLocations } from './daily'
import { CITIES } from './cities'
import { DAILY_OVERRIDES } from '../data/dailyOverrides'
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

    it('polygons are well-formed open rings (≥3 points, first ≠ last, finite)', () => {
      // The polygon contract (types.ts) and the backfill pipeline use OPEN
      // rings: ≥3 distinct points, first point NOT repeated at the end. A
      // closed ring still scores correctly (geo.ts treats rings as implicitly
      // closed) but violates the convention — guard against drift so a future
      // hand-edit or pipeline change can't silently reintroduce one.
      for (const l of data.locations) {
        if (l.polygon == null) continue
        const ring = l.polygon
        expect(
          ring.length,
          `${l.name} polygon too short`,
        ).toBeGreaterThanOrEqual(3)
        for (const [lat, lng] of ring) {
          expect(
            Number.isFinite(lat) && Number.isFinite(lng),
            `${l.name} polygon has a non-finite coord`,
          ).toBe(true)
        }
        const [fLat, fLng] = ring[0]
        const [lLat, lLng] = ring[ring.length - 1]
        expect(
          fLat !== lLat || fLng !== lLng,
          `${l.name} polygon is a CLOSED ring (first point repeated at end) — drop the duplicate`,
        ).toBe(true)
      }
    })

    // Only in-play rows are eligible for the daily game (daily.ts filters on
    // `inPlay !== false`). A capped city keeps benched rows in the file with NO
    // difficulty, so "enriched" is judged over the IN-PLAY set, mirroring the
    // runtime predicate `playable.every(l => l.difficulty != null)`.
    const playable = data.locations.filter((l) => l.inPlay !== false)
    const benched = data.locations.filter((l) => l.inPlay === false)
    const playableWithDifficulty = playable.filter(
      (l) => l.difficulty != null,
    ).length
    const enriched =
      playable.length > 0 && playableWithDifficulty === playable.length

    it('difficulty is all-or-nothing across the in-play set', () => {
      // A partially-enriched in-play set would silently fall back to the legacy
      // category plan in production (daily.ts uses `.every()`), so the difficulty
      // data would be ignored without warning. Fail loudly instead.
      expect(
        playableWithDifficulty === 0 ||
          playableWithDifficulty === playable.length,
        `${city.id}: ${playableWithDifficulty}/${playable.length} in-play locations have a difficulty — must be all or none`,
      ).toBe(true)
    })

    it('benched (inPlay:false) rows carry no difficulty', () => {
      // The play cap strips difficulty from benched rows (they keep only fame),
      // so they never leak into the difficulty plan. See apply-difficulty.mjs.
      for (const l of benched) {
        expect(
          l.difficulty == null,
          `${l.name} is benched but has difficulty=${l.difficulty}`,
        ).toBe(true)
      }
    })

    it('difficulty, when used, is present and valid on every in-play location', () => {
      if (!enriched) return // city not yet run through the fame pass
      for (const l of playable) {
        expect(
          DIFFICULTIES.has(l.difficulty as string),
          `${l.name} difficulty=${l.difficulty}`,
        ).toBe(true)
      }
    })

    it('respects its playCap: in-play count = min(playCap, total)', () => {
      if (city.playCap == null) return
      const expected = Math.min(city.playCap, data.locations.length)
      expect(playable.length).toBe(expected)
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

describe('DAILY_OVERRIDES — integration', () => {
  it('every override ID resolves to an in-play location in its city dataset', () => {
    for (const [seed, ids] of Object.entries(DAILY_OVERRIDES)) {
      const cityId = seed.split(':')[0]
      const data = DATASETS[cityId]
      expect(
        data,
        `no dataset for city "${cityId}" (seed: "${seed}")`,
      ).toBeTruthy()
      const inPlayIds = new Set(
        data.locations.filter((l) => l.inPlay !== false).map((l) => l.id),
      )
      for (const id of ids) {
        expect(
          inPlayIds.has(id),
          `override "${seed}": id "${id}" not found in in-play locations`,
        ).toBe(true)
      }
    }
  })
})
