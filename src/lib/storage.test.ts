import { describe, it, expect } from 'vitest'
import { defaultState, STORAGE_VERSION } from './storage'

describe('defaultState', () => {
  it('is a valid empty state at the current version', () => {
    const s = defaultState()
    expect(s.version).toBe(STORAGE_VERSION)
    expect(s.history).toEqual([])
    expect(s.streak).toEqual({ current: 0, best: 0, lastPlayedDateKey: null })
  })
})
