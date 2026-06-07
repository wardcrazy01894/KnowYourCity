/**
 * Results — end-of-day summary + Wordle-style shareable string.
 *
 * Shows total score (x / 500), a per-round breakdown (distance + score),
 * current/best streak, and a "Copy result" button.
 */

import { useState } from 'react'
import type { RoundResult } from '../types'
import { MAX_ROUND_SCORE, formatDistance } from '../lib/scoring'
import { ROUNDS_PER_DAY } from '../lib/daily'
import { log } from '../lib/log'

export interface ResultsProps {
  /** City label for the share card, e.g. "Seattle". */
  cityShort: string
  dateKey: string
  results: RoundResult[]
  totalScore: number
  streak: { current: number; best: number }
}

/** Emoji tier for a single round score (0–100 scale). */
export function scoreEmoji(score: number): string {
  if (score >= 80) return '🟩'
  if (score >= 50) return '🟨'
  if (score >= 20) return '🟧'
  return '⬛'
}

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
    `Know Your Locals — ${cityShort}`,
    `${dateKey} · ${totalScore.toLocaleString('en-US')}/${maxTotal.toLocaleString('en-US')}`,
    bar,
  ]
  if (url) lines.push(url)
  return lines.join('\n')
}

/**
 * The game's own absolute URL, for the share text. Uses the current origin +
 * Vite `base`, so it's correct on Pages (`…github.io/KnowYourLocals/`) and on a
 * future custom domain without hardcoding.
 */
export function shareSiteUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

export function Results({
  cityShort,
  dateKey,
  results,
  totalScore,
  streak,
}: ResultsProps) {
  const [copied, setCopied] = useState(false)
  const maxTotal = ROUNDS_PER_DAY * MAX_ROUND_SCORE

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        buildShareString(
          cityShort,
          dateKey,
          results,
          totalScore,
          shareSiteUrl(),
        ),
      )
      log.info('Results', 'copied share string')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // Clipboard blocked — no-op; the text is visible below anyway.
      log.warn('Results', 'clipboard copy failed', { error: String(e) })
    }
  }

  return (
    <section style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Done for today!</h2>
      <p style={{ fontSize: 28, fontWeight: 700, margin: '4px 0' }}>
        {totalScore.toLocaleString('en-US')}{' '}
        <span style={{ fontSize: 16, opacity: 0.6 }}>
          / {maxTotal.toLocaleString('en-US')}
        </span>
      </p>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        🔥 Streak {streak.current} (best {streak.best})
      </p>

      <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
        {results.map((r, i) => (
          <li key={r.location.id}>
            {scoreEmoji(r.score)} <strong>{r.location.name}</strong> —{' '}
            {formatDistance(r.distanceMeters)} ·{' '}
            {r.score.toLocaleString('en-US')} pts
            {i === results.length - 1 ? '' : ''}
          </li>
        ))}
      </ol>

      <button
        onClick={copy}
        style={{
          marginTop: 12,
          padding: '10px 16px',
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 8,
          border: 'none',
          background: '#f4b400',
          color: '#0f1720',
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied!' : 'Copy result'}
      </button>

      <pre
        style={{
          marginTop: 16,
          padding: 12,
          background: '#0b1118',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          fontSize: 14,
        }}
      >
        {buildShareString(
          cityShort,
          dateKey,
          results,
          totalScore,
          shareSiteUrl(),
        )}
      </pre>
    </section>
  )
}
