/**
 * Results — end-of-day summary + Wordle-style shareable string.
 *
 * Shows total score (x / 500), a per-round breakdown (distance + score),
 * current/best streak, and a "Copy result" button.
 */

import { useEffect, useState } from 'react'
import type { RoundResult } from '../types'
import { MAX_ROUND_SCORE, formatDistance } from '../lib/scoring'
import { ROUNDS_PER_DAY } from '../lib/daily'
import { log } from '../lib/log'
import {
  submitDailyScore,
  formatStanding,
  readStanding,
  type Standing,
} from '../lib/leaderboard'
import { Leaderboard } from './Leaderboard'

/** Whether the leaderboard endpoint is configured at build time. */
const LEADERBOARD_ENABLED = Boolean(import.meta.env.VITE_LEADERBOARD_ENDPOINT)

export interface ResultsProps {
  /** City id — namespaces the leaderboard submission/cache. */
  cityId: string
  /** City label for the share card, e.g. "Seattle". */
  cityShort: string
  dateKey: string
  results: RoundResult[]
  totalScore: number
  streak: { current: number; best: number }
  /** True only for the official daily challenge — gates leaderboard submission. */
  official: boolean
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
    `Know Your City — ${cityShort}`,
    `${dateKey} · ${totalScore.toLocaleString('en-US')}/${maxTotal.toLocaleString('en-US')}`,
    bar,
  ]
  if (url) lines.push(url)
  return lines.join('\n')
}

/**
 * The game's own absolute URL, for the share text. Uses the current origin +
 * Vite `base`, so it's correct on the custom domain (`knowyourcity.gg`) and on a
 * future custom domain without hardcoding.
 */
export function shareSiteUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

export function Results({
  cityId,
  cityShort,
  dateKey,
  results,
  totalScore,
  streak,
  official,
}: ResultsProps) {
  const [copied, setCopied] = useState(false)
  // Leaderboard standing: seed from any cached value (instant on reload), then
  // submit once on mount. Stays null when the leaderboard is off/unavailable, in
  // which case nothing renders — the feature never blocks the results screen.
  const [standing, setStanding] = useState<Standing | null>(() =>
    official ? readStanding(cityId, dateKey) : null,
  )
  const [showBoard, setShowBoard] = useState(false)
  // Prefer the server-computed streak (authoritative, accounts-ready) when the
  // submission returns one; otherwise fall back to the local streak.
  const shownStreak = standing?.streak ?? streak

  useEffect(() => {
    let live = true
    submitDailyScore({ cityId, dateKey, score: totalScore, official })
      .then((s) => {
        if (live && s) setStanding(s)
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // Submit once for this finished day; inputs are stable for a given render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const maxTotal = ROUNDS_PER_DAY * MAX_ROUND_SCORE
  // Compute once so the copied text and the preview below can never diverge.
  const shareText = buildShareString(
    cityShort,
    dateKey,
    results,
    totalScore,
    shareSiteUrl(),
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      log.info('Results', 'copied share string')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      // Clipboard blocked — no-op; the text is visible below anyway.
      log.warn('Results', 'clipboard copy failed', { error: String(e) })
    }
  }

  if (showBoard) {
    return (
      <Leaderboard
        cityId={cityId}
        cityShort={cityShort}
        dateKey={dateKey}
        yourScore={official ? totalScore : undefined}
        yourStanding={standing}
        onClose={() => setShowBoard(false)}
      />
    )
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
        🔥 Streak {shownStreak.current} (best {shownStreak.best})
      </p>
      {standing && (
        <p
          style={{
            marginTop: 0,
            fontWeight: 600,
            color: '#7fb2ff',
          }}
        >
          🏆 {formatStanding(standing)}
        </p>
      )}

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

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={copy}
          style={{
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
        {LEADERBOARD_ENABLED && (
          <button
            onClick={() => setShowBoard(true)}
            style={{
              padding: '10px 16px',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #7fb2ff',
              background: 'transparent',
              color: '#7fb2ff',
              cursor: 'pointer',
            }}
          >
            🏆 View leaderboard
          </button>
        )}
      </div>

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
        {shareText}
      </pre>
    </section>
  )
}
