import { describe, it, expect, vi, afterEach } from 'vitest'
import { scoreTier, isMuted, setMuted } from './sound'

describe('scoreTier', () => {
  it('100 is a perfect', () => {
    expect(scoreTier(100)).toBe('perfect')
  })

  it('green range (80-99) is good', () => {
    expect(scoreTier(99)).toBe('good')
    expect(scoreTier(80)).toBe('good')
  })

  it('yellow range (50-79) is mid', () => {
    expect(scoreTier(79)).toBe('mid')
    expect(scoreTier(50)).toBe('mid')
  })

  it('below 50 is womp', () => {
    expect(scoreTier(49)).toBe('womp')
    expect(scoreTier(0)).toBe('womp')
  })
})

describe('isMuted / setMuted', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips through localStorage under the kyc:muted key', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    expect(isMuted()).toBe(false) // default: not muted
    setMuted(true)
    expect(store.get('kyc:muted')).toBe('1')
    expect(isMuted()).toBe(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
  })

  it('fails safe (unmuted, no throw) when storage is unavailable', () => {
    // e.g. Safari private mode; also the bare-node case (no localStorage at all).
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(isMuted()).toBe(false)
    expect(() => setMuted(true)).not.toThrow()
  })
})
