import { describe, it, expect } from 'vitest'
import { CITIES, getCity, DEFAULT_CITY_ID } from './cities'

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

  it('every city has sane bounds and an IANA timezone', () => {
    for (const c of CITIES) {
      const [[s, w], [n, e]] = c.bounds
      expect(s).toBeLessThan(n)
      expect(w).toBeLessThan(e)
      expect(c.timeZone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/)
      expect(c.short.length).toBeGreaterThan(0)
    }
  })
})
