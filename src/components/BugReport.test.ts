import { describe, it, expect, vi, afterEach } from 'vitest'
import { resetTurnstile } from './BugReport'

/**
 * Turnstile tokens are single-use: after a failed send we must reset the widget
 * so the next attempt gets a fresh token (otherwise siteverify rejects the
 * already-consumed one until it auto-refreshes). resetTurnstile is the seam the
 * component calls on its failure paths; here we verify it forwards to the global
 * widget and never throws when Turnstile isn't present.
 */
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resetTurnstile', () => {
  it('calls window.turnstile.reset with the widget id', () => {
    const reset = vi.fn()
    vi.stubGlobal('window', { turnstile: { reset } })
    resetTurnstile('widget-1')
    expect(reset).toHaveBeenCalledWith('widget-1')
  })

  it('does nothing and does not throw when Turnstile is not loaded', () => {
    vi.stubGlobal('window', {})
    expect(() => resetTurnstile('widget-1')).not.toThrow()
  })

  it('swallows errors thrown by reset (best-effort)', () => {
    vi.stubGlobal('window', {
      turnstile: {
        reset: () => {
          throw new Error('widget already gone')
        },
      },
    })
    expect(() => resetTurnstile()).not.toThrow()
  })
})
