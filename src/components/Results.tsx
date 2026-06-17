/**
 * Results — end-of-day summary + Wordle-style shareable string.
 *
 * Shows total score (x / 500), a per-round breakdown (distance + score),
 * current/best streak, and a "Copy result" button.
 */

import { useEffect, useRef, useState } from 'react'
import type { RoundResult } from '../types'
import { MAX_ROUND_SCORE, formatDistance } from '../lib/scoring'
import { ROUNDS_PER_DAY } from '../lib/daily'
import { log } from '../lib/log'
import { shouldCelebrate, countGreens } from '../lib/celebrate'
import { isCelebrateTest } from '../lib/devmode'
import { fireConfetti } from '../lib/confetti'
import { playCheer } from '../lib/sound'
import { loadState } from '../lib/storage'
import {
  submitDailyScore,
  fetchLeaderboard,
  refreshStanding,
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
  /** Hash of the lineup just played (progress.ts:lineupHash) — keys the
   *  leaderboard submission/cache so a changed-set replay adds its own row. */
  lineup: string
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
  lineup,
  streak,
  official,
}: ResultsProps) {
  const [copied, setCopied] = useState(false)
  // Leaderboard standing: seed from any cached value (instant on reload), then
  // submit once on mount. Stays null when the leaderboard is off/unavailable, in
  // which case nothing renders — the feature never blocks the results screen.
  const [standing, setStanding] = useState<Standing | null>(() =>
    official ? readStanding(cityId, dateKey, lineup) : null,
  )
  // All of the viewer's totals for the day (one normally; two after a
  // changed-set replay) — highlights each of their rows on the board. Read once
  // from history, which already holds this completion's record by now.
  const [yourScores] = useState<number[]>(() =>
    official
      ? loadState(cityId)
          .history.filter((h) => h.dateKey === dateKey)
          .map((h) => h.totalScore)
      : [],
  )
  const [showBoard, setShowBoard] = useState(false)
  // Prefer the server-computed streak (authoritative, accounts-ready) when the
  // submission returns one; otherwise fall back to the local streak.
  const shownStreak = standing?.streak ?? streak

  useEffect(() => {
    let live = true
    async function run() {
      const s = await submitDailyScore({
        cityId,
        dateKey,
        score: totalScore,
        lineup,
        official,
      })
      if (!live || !s) return
      setStanding(s)
      // Submit caches its standing write-once (no re-POST on reload), so the
      // rank/total would otherwise freeze at finish time. Refresh them against a
      // fresh read so "Nth of Y · top Z%" stays current as more players finish.
      const fresh = await fetchLeaderboard(cityId, dateKey)
      if (live && fresh) setStanding(refreshStanding(s, fresh, totalScore))
    }
    // Best-effort: any failure leaves the cached standing in place — the
    // leaderboard never blocks or breaks the results screen.
    run().catch(() => {})
    return () => {
      live = false
    }
    // Submit once for this finished day; inputs are stable for a given render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Celebrate a strong finish (4+ greens or a total over 400): confetti + a crowd
  // cheer, once when the results screen first mounts. Confetti is visual so it
  // ignores the mute toggle; the cheer is gated by mute inside playCheer(). The
  // ref guard makes it fire exactly once even under StrictMode's dev double-mount
  // (so it also can't be re-forced by `?celebrate` mid-lifetime — fine for a
  // preview flag). cancelConfetti stops the shower when the leaderboard opens.
  const celebratedRef = useRef(false)
  const cancelConfettiRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (celebratedRef.current) return
    // `?celebrate` forces it on for previewing/tuning (see lib/devmode.ts).
    const forced = isCelebrateTest(window.location.search)
    if (!forced && !shouldCelebrate(results, totalScore)) return
    celebratedRef.current = true
    log.info('Results', 'celebrating strong finish', {
      greens: countGreens(results),
      totalScore,
    })
    cancelConfettiRef.current = fireConfetti()
    playCheer()
    // Fire once on mount; results/totalScore are fixed for this finished day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Open the leaderboard, first stopping any still-raining confetti shower. */
  function openBoard() {
    cancelConfettiRef.current?.()
    setShowBoard(true)
  }

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
        yourScores={yourScores}
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
        {results.map((r) => (
          <li key={r.location.id}>
            {scoreEmoji(r.score)} <strong>{r.location.name}</strong> —{' '}
            {formatDistance(r.distanceMeters)} ·{' '}
            {r.score.toLocaleString('en-US')} pts
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
            onClick={openBoard}
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
