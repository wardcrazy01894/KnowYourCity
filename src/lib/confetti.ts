/**
 * Confetti burst for a strong finish on the results screen. Inspired by the
 * end-of-game flourish on maptap.gg: a big initial pop plus a ~2s shower from two
 * side cannons, so it's unmistakable rather than a single frame you might miss.
 *
 * We render onto our OWN full-screen, `pointer-events:none` canvas with
 * `useWorker:false`. canvas-confetti's default global instead renders via a Web
 * Worker + OffscreenCanvas, which silently draws nothing in some browser/dev
 * setups — owning the canvas and staying on the main thread renders reliably and
 * lets us control stacking (`z-index`) and click pass-through directly. The canvas
 * never intercepts clicks, so it can't block the results card or leaderboard.
 *
 * `fireConfetti` returns a cancel handle: the caller stops the still-raining
 * shower when it swaps the results view for the leaderboard. Best-effort — any
 * failure is swallowed so it can never break the results screen. No-op without a
 * DOM (tests/SSR).
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

// One reused fire() bound to our own canvas, created on first use.
let fire: confetti.CreateTypes | null = null
function getFire(): confetti.CreateTypes {
  if (fire) return fire
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(Z_INDEX),
  })
  document.body.appendChild(canvas)
  fire = confetti.create(canvas, { resize: true, useWorker: false })
  return fire
}

/**
 * Fire the celebratory confetti. Synchronous; returns a cancel handle that stops
 * the ongoing shower (the initial pop has already been drawn and just fades out).
 */
export function fireConfetti(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return NOOP
  try {
    const burst = getFire()
    // One big pop from the lower-centre — always shown (even under reduced
    // motion) so the moment is clearly acknowledged.
    burst({
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
      burst({
        particleCount: 7,
        angle: 60,
        spread: 65,
        startVelocity: 55,
        origin: { x: 0, y: 0.7 },
      })
      burst({
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
