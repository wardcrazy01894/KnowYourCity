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
  // that can desync a bundled daily override from its dataset. Stamping the
  // per-deploy build hash makes every new bundle request a fresh JSON. (This is
  // defense-in-depth over the no-cache headers in public/_headers.)
  describe('cityDataUrl — cache-busting', () => {
    const v = (id: string) =>
      new URL(cityDataUrl(id), 'https://x').searchParams.get('v')

    it('points at the city dataset with a non-empty version query', () => {
      const url = cityDataUrl('stpete')
      expect(url).toContain('locations.stpete.json?v=')
      // Asserts a real value got stamped — independent of the function's own
      // 'dev' fallback, so it can't pass by both sides defaulting in lockstep.
      expect(v('stpete')).toBeTruthy()
    })

    it('uses the same version for every city (one build → one hash)', () => {
      expect(v('seattle')).toBe(v('stpete'))
    })

    it('the version matches the injected build hash when present', () => {
      // In CI the build hash is the git short sha; assert the URL carries
      // exactly that, not some unrelated string. Skips only if no hash exists.
      const injected = import.meta.env.VITE_BUILD_HASH
      if (!injected) return
      expect(v('stpete')).toBe(injected)
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
