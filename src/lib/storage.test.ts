import { describe, it, expect } from 'vitest'
import { shouldStartFresh } from './storage'

describe('shouldStartFresh', () => {
  it('resets in dev by default', () => {
    expect(shouldStartFresh('', true)).toBe(true)
  })

  it('does not reset in production by default', () => {
    expect(shouldStartFresh('', false)).toBe(false)
  })

  it('?keep opts out even in dev', () => {
    expect(shouldStartFresh('?keep', true)).toBe(false)
  })

  it('?fresh and ?reset force a reset even in production', () => {
    expect(shouldStartFresh('?fresh', false)).toBe(true)
    expect(shouldStartFresh('?reset', false)).toBe(true)
  })

  it('?keep wins over ?fresh', () => {
    expect(shouldStartFresh('?fresh&keep', true)).toBe(false)
  })
})
