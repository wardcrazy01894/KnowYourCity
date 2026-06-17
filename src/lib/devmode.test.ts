import { describe, it, expect } from 'vitest'
import {
  shouldStartFresh,
  shouldShuffle,
  isPolygonTest,
  polygonTestIds,
  isCelebrateTest,
} from './devmode'

describe('shouldStartFresh', () => {
  it('does NOT reset by default (persists progress)', () => {
    expect(shouldStartFresh('')).toBe(false)
    expect(shouldStartFresh('?date=2026-06-06')).toBe(false)
  })

  it('resets with ?reset or ?fresh', () => {
    expect(shouldStartFresh('?reset')).toBe(true)
    expect(shouldStartFresh('?fresh')).toBe(true)
  })

  it('shuffle mode also resets each load', () => {
    expect(shouldStartFresh('?shuffle')).toBe(true)
    expect(shouldStartFresh('?random')).toBe(true)
  })
})

describe('isPolygonTest', () => {
  it('is on only for ?polygons', () => {
    expect(isPolygonTest('?polygons')).toBe(true)
    expect(isPolygonTest('?city=stpete&polygons')).toBe(true)
  })

  it('is off otherwise', () => {
    expect(isPolygonTest('')).toBe(false)
    expect(isPolygonTest('?shuffle')).toBe(false)
    expect(isPolygonTest('?date=2026-06-06')).toBe(false)
  })

  it('stays on when ?polygons has a value (subset form)', () => {
    expect(isPolygonTest('?polygons=azalea-park,isla-del-sol')).toBe(true)
  })
})

describe('polygonTestIds', () => {
  it('is null when ?polygons has no value (means: every polygon)', () => {
    expect(polygonTestIds('?polygons')).toBeNull()
    expect(polygonTestIds('?city=stpete&polygons')).toBeNull()
  })

  it('parses a comma-separated id subset', () => {
    expect(polygonTestIds('?polygons=azalea-park,isla-del-sol')).toEqual([
      'azalea-park',
      'isla-del-sol',
    ])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(polygonTestIds('?polygons=azalea-park,,%20fort-de-soto%20')).toEqual(
      ['azalea-park', 'fort-de-soto'],
    )
  })

  it('is null when not a polygon test at all', () => {
    expect(polygonTestIds('')).toBeNull()
    expect(polygonTestIds('?date=2026-06-06')).toBeNull()
  })
})

describe('isCelebrateTest', () => {
  it('is on only for ?celebrate', () => {
    expect(isCelebrateTest('?celebrate')).toBe(true)
    expect(isCelebrateTest('?reset&celebrate')).toBe(true)
  })

  it('is off otherwise', () => {
    expect(isCelebrateTest('')).toBe(false)
    expect(isCelebrateTest('?date=2026-06-06')).toBe(false)
  })
})

describe('shouldShuffle', () => {
  it('is on only for ?shuffle / ?random', () => {
    expect(shouldShuffle('?shuffle')).toBe(true)
    expect(shouldShuffle('?random')).toBe(true)
  })

  it('is off otherwise', () => {
    expect(shouldShuffle('')).toBe(false)
    expect(shouldShuffle('?reset')).toBe(false)
    expect(shouldShuffle('?date=2026-06-06')).toBe(false)
  })
})
