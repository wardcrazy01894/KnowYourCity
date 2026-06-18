import { describe, it, expect } from 'vitest'
import { resolveMode } from './mode'
import type { City } from './cities'

const CITY: City = {
  id: 'stpete',
  name: 'St. Petersburg, FL',
  short: 'St. Pete',
  timeZone: 'America/New_York',
  bounds: [
    [27.62, -82.79],
    [27.87, -82.58],
  ],
  target: 520,
  playCap: 400,
}

// A fixed instant; the city tz (America/New_York) puts this on 2026-06-18.
const NOW = new Date('2026-06-18T12:00:00Z')
const SEED = 'abc123'

describe('resolveMode', () => {
  it('normal mode is official and uses the real per-city storage namespace', () => {
    const m = resolveMode(CITY, '', NOW, SEED)
    expect(m.official).toBe(true)
    expect(m.storageCityId).toBe('stpete')
    expect(m.dateKey).toBe('2026-06-18')
  })

  it('shuffle is NOT official and is isolated from the real daily save', () => {
    const m = resolveMode(CITY, '?shuffle', NOW, SEED)
    expect(m.official).toBe(false)
    // The bug this guards: a finished shuffle game must not write the real
    // streak/history or clobber the in-progress daily — so it cannot share
    // the official `city.id` namespace.
    expect(m.storageCityId).not.toBe('stpete')
  })

  it('a ?date= override is NOT official and is isolated from the real daily save', () => {
    const m = resolveMode(CITY, '?date=2026-01-15', NOW, SEED)
    expect(m.official).toBe(false)
    expect(m.dateKey).toBe('2026-01-15')
    // ?date= bumping the real streak keyed to an arbitrary calendar date was
    // the sharp edge of the bug — it must live in its own namespace.
    expect(m.storageCityId).not.toBe('stpete')
  })

  it('an invalid ?date= falls through to the official daily', () => {
    const m = resolveMode(CITY, '?date=2026-99-99', NOW, SEED)
    expect(m.official).toBe(true)
    expect(m.storageCityId).toBe('stpete')
    expect(m.dateKey).toBe('2026-06-18')
  })

  it('?polygons keeps its existing isolated namespace and is not official', () => {
    const m = resolveMode(CITY, '?polygons', NOW, SEED)
    expect(m.official).toBe(false)
    expect(m.polygonTest).toBe(true)
    expect(m.storageCityId).toBe('stpete__polygons')
  })

  it('every non-official mode keeps its scores out of the real daily namespace', () => {
    for (const search of ['?shuffle', '?date=2026-01-15', '?polygons']) {
      const m = resolveMode(CITY, search, NOW, SEED)
      expect(m.official).toBe(false)
      expect(m.storageCityId).not.toBe(CITY.id)
    }
  })
})
