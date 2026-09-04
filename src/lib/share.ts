/**
 * Share string — the Wordle-style clipboard text for a finished day. Pure (no
 * DOM) so it's unit-testable in the Node env; Results.tsx supplies the URL.
 * See docs/PLAN.md §5.7.
 */

import type { RoundResult } from '../types'
import { MAX_ROUND_SCORE, scoreEmoji } from './scoring'
import { ROUNDS_PER_DAY } from './daily'

/**
 * Pure: builds the clipboard share text from a finished day's results.
 * When `url` is given, it's appended as the last line so a shared result links
 * back to the game (drives new players). Callers pass the site's own URL.
 */
export function buildShareString(
  cityShort: string,
  dateKey: string,
  results: RoundResult[],
  totalScore: number,
  url?: string,
): string {
  const maxTotal = ROUNDS_PER_DAY * MAX_ROUND_SCORE
  const bar = results.map((r) => scoreEmoji(r.score)).join('')
  const lines = [
    `Know Your City — ${cityShort}`,
    `${dateKey} · ${totalScore.toLocaleString('en-US')}/${maxTotal.toLocaleString('en-US')}`,
    bar,
  ]
  if (url) lines.push(url)
  return lines.join('\n')
}
