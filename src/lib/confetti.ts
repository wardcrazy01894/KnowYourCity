/**
 * Confetti burst for a strong finish on the results screen. Inspired by the
 * end-of-game flourish on maptap.gg: a big initial pop plus a ~2s shower from two
 * side cannons, so it's unmistakable rather than a single frame you might miss.
 *
 * `canvas-confetti` renders its own fixed, `pointer-events:none` canvas over the
 * page, so it never intercepts clicks on the results card or leaderboard beneath
 * it. `fireConfetti` returns a cancel handle: the caller stops the still-raining
 * shower when it swaps the results view for the leaderboard, so confetti never
 * keeps falling over the board. Best-effort — any failure is swallowed so it can
 * never break the results screen. No-op without a DOM (tests/SSR).
 */

import confetti from 'canvas-confetti'
import { log } from './log'

/** True when the user asked the OS/browser to minimize animation. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const Z_INDEX = 9999
const SHOWER_MS = 2200

/** A no-op cancel handle (nothing to stop). */
const NOOP = () => {}

/**
 * Fire the celebratory confetti. Synchronous; returns a cancel handle that stops
 * the ongoing shower (the initial pop has already been drawn and just fades out).
 */
export function fireConfetti(): () => void {
  if (typeof window === 'undefined') return NOOP
  try {
    // One big pop from the lower-centre — always shown (even under reduced
    // motion) so the moment is clearly acknowledged.
    confetti({
      zIndex: Z_INDEX,
      particleCount: 150,
      spread: 90,
      startVelocity: 45,
      scalar: 1.1,
      origin: { x: 0.5, y: 0.62 },
    })

    // Reduced motion: the single pop is enough; skip the sustained shower.
    if (prefersReducedMotion()) return NOOP

    // Sustained shower: two side cannons angled inward, firing each frame for a
    // couple of seconds so confetti keeps raining after the initial pop.
    let cancelled = false
    let rafId = 0
    const end = performance.now() + SHOWER_MS
    const tick = () => {
      if (cancelled) return
      confetti({
        zIndex: Z_INDEX,
        particleCount: 7,
        angle: 60,
        spread: 65,
        startVelocity: 55,
        origin: { x: 0, y: 0.7 },
      })
      confetti({
        zIndex: Z_INDEX,
        particleCount: 7,
        angle: 120,
        spread: 65,
        startVelocity: 55,
        origin: { x: 1, y: 0.7 },
      })
      if (performance.now() < end) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  } catch (e) {
    log.warn('confetti', 'burst failed', { error: String(e) })
    return NOOP
  }
}
