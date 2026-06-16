import { describe, it, expect } from 'vitest'
import { CITIES, getCity, DEFAULT_CITY_ID, cityDataUrl } from './cities'

describe('cities registry', () => {
  it('has the five expected cities', () => {
    expect(CITIES.map((c) => c.id).sort()).toEqual([
      'annarbor',
      'chicago',
      'seattle',
      'statecollege',
      'stpete',
    ])
  })

  it('getCity resolves by id, else undefined', () => {
    expect(getCity('seattle')?.name).toContain('Seattle')
    expect(getCity('nope')).toBeUndefined()
    expect(getCity(null)).toBeUndefined()
    expect(getCity(undefined)).toBeUndefined()
  })

  it('the default city exists', () => {
    expect(getCity(DEFAULT_CITY_ID)).toBeTruthy()
  })

  // The dataset JSON has a STABLE filename (locations.<id>.json), so a mobile
  // cache can serve a stale copy against a freshly-loaded JS bundle — the skew
  // that silently broke a daily override (hurricane-bar incident, 2026-06-16).
  // Stamping the per-deploy build hash onto the URL makes every new bundle
  // request a fresh JSON, locking the two together.
  describe('cityDataUrl — cache-busting', () => {
    const hash = import.meta.env.VITE_BUILD_HASH ?? 'dev'

    it('points at the city dataset with a build-hash version query', () => {
      const url = cityDataUrl('stpete')
      expect(url).toContain('locations.stpete.json')
      expect(url).toContain(`?v=${hash}`)
    })

    it('uses the same version for every city (one build → one hash)', () => {
      const v = (id: string) =>
        new URL(cityDataUrl(id), 'https://x').searchParams.get('v')
      expect(v('stpete')).toBe(hash)
      expect(v('seattle')).toBe(v('stpete'))
    })
  })

  it('every city has sane bounds and an IANA timezone', () => {
    for (const c of CITIES) {
      const [[s, w], [n, e]] = c.bounds
      expect(s).toBeLessThan(n)
      expect(w).toBeLessThan(e)
      expect(c.timeZone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/)
      expect(c.short.length).toBeGreaterThan(0)
      // target is the build-script size cap: null (uncapped) or a positive number.
      expect(
        c.target === null || (Number.isFinite(c.target) && c.target > 0),
        `${c.id} target=${c.target}`,
      ).toBe(true)
      // playCap is the daily play-set cap: absent/null or a positive number.
      expect(
        c.playCap == null || (Number.isFinite(c.playCap) && c.playCap > 0),
        `${c.id} playCap=${c.playCap}`,
      ).toBe(true)
    }
  })
})
