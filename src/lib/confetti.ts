/**
 * Confetti burst for a strong finish on the results screen. Wraps
 * `canvas-confetti` behind a lazy dynamic import so the library is only fetched
 * when a celebration actually fires (it never loads on a normal play-through, and
 * never at module-eval time, keeping the pure-logic tests free of canvas).
 *
 * No-op when there's no DOM (tests/SSR) or when the user prefers reduced motion —
 * confetti is decorative, so we never override that accessibility preference.
 */

import { log } from './log'

/** True when the user has asked the OS/browser to minimize animation. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Fire a short, celebratory confetti burst: a center pop plus two angled side
 * cannons, like the end-of-game flourish on maptap.gg. Best-effort — any failure
 * is swallowed so it can never break or block the results screen.
 */
export async function fireConfetti(): Promise<void> {
  if (typeof window === 'undefined') return
  if (prefersReducedMotion()) return
  try {
    const confetti = (await import('canvas-confetti')).default
    // Render above the app (results card, leaderboard) and ignore pointer events.
    const opts = { zIndex: 9999, disableForReducedMotion: true }

    // Center pop.
    confetti({
      ...opts,
      particleCount: 120,
      spread: 70,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.6 },
    })
    // Two side cannons angled inward for a fuller spray.
    confetti({
      ...opts,
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
    })
    confetti({
      ...opts,
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
    })
  } catch (e) {
    log.warn('confetti', 'burst failed', { error: String(e) })
  }
}
