/**
 * Results — end-of-day summary + Wordle-style shareable string.
 *
 * Shows total score (x / 25,000), a per-round breakdown (distance + score),
 * current/best streak, and a "Copy result" button.
 */

import { useState } from 'react'
import type { RoundResult } from '../types'
import { MAX_ROUND_SCORE, formatDistance } from '../lib/scoring'
import { ROUNDS_PER_DAY } from '../lib/daily'

export interface ResultsProps {
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

/** Pure: builds the clipboard share text from a finished day's results. */
export function buildShareString(
  dateKey: string,
  results: RoundResult[],
  totalScore: number,
): string {
  const maxTotal = ROUNDS_PER_DAY * MAX_ROUND_SCORE
  const bar = results.map((r) => scoreEmoji(r.score)).join('')
  return [
    'Know Your Locals — St. Pete',
    `${dateKey} · ${totalScore.toLocaleString('en-US')}/${maxTotal.toLocaleString('en-US')}`,
    bar,
  ].join('\n')
}

export function Results({
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
        buildShareString(dateKey, results, totalScore),
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — no-op; the text is visible below anyway.
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
        {buildShareString(dateKey, results, totalScore)}
      </pre>
    </section>
  )
}
