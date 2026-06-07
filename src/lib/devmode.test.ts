import { describe, it, expect } from 'vitest'
import { shouldStartFresh, shouldShuffle } from './devmode'

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
