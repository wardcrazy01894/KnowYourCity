/**
 * Results — end-of-day summary + Wordle-style shareable string.
 *
 * Shows total score (x / 25,000), a per-round breakdown (distance + score),
 * current/best streak, and a "Copy result" button.
 *
 * Share string design (no map spoilers, emoji bar per round). Example:
 *
 *   Know Your Locals — St. Pete
 *   2026-06-06 · 21,430/25,000
 *   🟩🟩🟩🟨⬛
 *   knowyourlocals.gg
 *
 * Emoji tiers by round score: 🟩 ≥4000, 🟨 ≥2000, 🟧 ≥500, ⬛ <500.
 * buildShareString is a pure function so it can be unit-tested.
 */

import type { RoundResult } from '../types'

export interface ResultsProps {
  dateKey: string
  results: RoundResult[]
  totalScore: number
  streak: { current: number; best: number }
}

/** Pure: builds the clipboard share text from a finished day's results. */
export function buildShareString(
  _dateKey: string,
  _results: RoundResult[],
  _totalScore: number,
): string {
  // TODO: map each result.score → emoji tier, assemble the block above.
  throw new Error('not implemented')
}

export function Results(_props: ResultsProps) {
  // TODO: render summary + breakdown + Copy button (navigator.clipboard).
  return (
    <section data-stub="Results" style={{ padding: 16 }}>
      Results go here.
    </section>
  )
}
