/**
 * Celebration trigger — pure logic for "did the player do well enough to earn a
 * confetti + applause moment?" on the end-of-day results screen.
 *
 * A day celebrates when EITHER:
 *   • the player landed 4+ greens (rounds at the green tier, score ≥ 80), or
 *   • the day's total is strictly over 400 (out of 500).
 *
 * "Green" is tied to the same tier the share emoji and feedback sound use
 * (`scoreTier`), so the bar of 🟩's a player sees always matches the count here.
 */

import type { RoundResult } from '../types'
import { scoreTier } from './sound'

/** Greens needed (alone) to celebrate. */
export const CELEBRATION_MIN_GREENS = 4
/** Day total must be strictly greater than this to celebrate. Max is 500. */
export const CELEBRATION_MIN_SCORE = 400

/** Rounds at the green tier (score ≥ 80 — i.e. 'good' or 'perfect'). */
export function countGreens(results: RoundResult[]): number {
  return results.filter((r) => {
    const tier = scoreTier(r.score)
    return tier === 'good' || tier === 'perfect'
  }).length
}

/** Whether a finished day earns the celebration. */
export function shouldCelebrate(
  results: RoundResult[],
  totalScore: number,
): boolean {
  return (
    countGreens(results) >= CELEBRATION_MIN_GREENS ||
    totalScore > CELEBRATION_MIN_SCORE
  )
}
