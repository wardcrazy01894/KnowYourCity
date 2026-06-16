/**
 * Leaderboard — the day's top scores for one city.
 *
 * Anonymous: the server returns scores only (no names, no ids). We rank them
 * (ties share a rank) and highlight the viewer's own score. If the viewer placed
 * outside the shown top-N, their standing is shown as a separate line so they can
 * always see where they landed. Read-only and best-effort: a load failure shows a
 * friendly empty state, never an error that blocks the results screen.
 */

import { useEffect, useState } from 'react'
import { MAX_ROUND_SCORE } from '../lib/scoring'
import { ROUNDS_PER_DAY } from '../lib/daily'
import {
  fetchLeaderboard,
  buildLeaderboardRows,
  refreshStanding,
  ordinal,
  type LeaderboardRow,
  type Standing,
} from '../lib/leaderboard'

export interface LeaderboardProps {
  cityId: string
  cityShort: string
  dateKey: string
  /** The viewer's own total today (highlights their row), if they played. */
  yourScore?: number
  /** The viewer's standing, for the "you placed Xth" line when off the shown list. */
  yourStanding?: Standing | null
  onClose: () => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'empty' }
  | {
      phase: 'ready'
      rows: LeaderboardRow[]
      total: number
      /** The viewer's standing, refreshed against this fresh read. */
      you: Standing | null
    }

export function Leaderboard({
  cityId,
  cityShort,
  dateKey,
  yourScore,
  yourStanding,
  onClose,
}: LeaderboardProps) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const maxTotal = ROUNDS_PER_DAY * MAX_ROUND_SCORE

  useEffect(() => {
    let live = true
    fetchLeaderboard(cityId, dateKey).then((data) => {
      if (!live) return
      if (!data || data.scores.length === 0) {
        setState({ phase: 'empty' })
        return
      }
      // Refresh the viewer's standing against this fresh read so the off-list
      // "You placed Nth of Y" line matches the fresh header (not the frozen
      // submit-time snapshot).
      const you =
        yourStanding && yourScore !== undefined
          ? refreshStanding(yourStanding, data, yourScore)
          : (yourStanding ?? null)
      setState({
        phase: 'ready',
        rows: buildLeaderboardRows(data.scores, yourScore),
        total: data.total,
        you,
      })
    })
    return () => {
      live = false
    }
    // One fetch per open; inputs are stable for a given mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Did the viewer's own row appear in the shown list? If not (off the top-N),
  // we still show their standing below.
  const youShown = state.phase === 'ready' && state.rows.some((r) => r.you)

  return (
    <section style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h2 style={{ marginBottom: 4 }}>🏆 Leaderboard — {cityShort}</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#7fb2ff',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          ← back
        </button>
      </div>
      <p style={{ marginTop: 0, opacity: 0.7, fontSize: 14 }}>
        {dateKey}
        {state.phase === 'ready' && (
          <>
            {' · '}
            {state.total.toLocaleString('en-US')}{' '}
            {state.total === 1 ? 'player' : 'players'} today
          </>
        )}
      </p>

      {state.phase === 'loading' && <p style={{ opacity: 0.7 }}>Loading…</p>}

      {state.phase === 'empty' && (
        <p style={{ opacity: 0.7 }}>
          No scores yet today — be the first to finish!
        </p>
      )}

      {state.phase === 'ready' && (
        <>
          <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {state.rows.map((r, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  marginBottom: 2,
                  background: r.you ? 'rgba(127,178,255,0.18)' : 'transparent',
                  fontWeight: r.you ? 700 : 400,
                }}
              >
                <span style={{ opacity: 0.85 }}>
                  {medal(r.rank)} {ordinal(r.rank)}
                  {r.you && <span style={{ color: '#7fb2ff' }}> · you</span>}
                </span>
                <span>
                  {r.score.toLocaleString('en-US')}{' '}
                  <span style={{ opacity: 0.5 }}>
                    / {maxTotal.toLocaleString('en-US')}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {state.total > state.rows.length && (
            <p style={{ opacity: 0.55, fontSize: 12, marginTop: 8 }}>
              Showing the top {state.rows.length} of{' '}
              {state.total.toLocaleString('en-US')}.
            </p>
          )}
          {!youShown && state.you && (
            <p style={{ marginTop: 8, fontWeight: 600, color: '#7fb2ff' }}>
              You placed {ordinal(state.you.rank)} of{' '}
              {state.you.total.toLocaleString('en-US')}
              {yourScore !== undefined &&
                ` · ${yourScore.toLocaleString('en-US')} pts`}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** A medal for the podium, a bullet otherwise. */
function medal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return '•'
}
