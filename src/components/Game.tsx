/**
 * Game — orchestrates the 5-round daily flow for the selected locations.
 *
 * Flow per round:
 *   1. Show the location NAME (+ optional clue). phase = 'guessing'.
 *   2. Player places a pin on <MapGuess/> and hits "Submit guess".
 *   3. Compute distance+score, phase = 'revealed': MapGuess shows truth + line.
 *   4. After the last round, phase = 'finished' → render <Results/>.
 *
 * Persistence: resume today's in-progress (or finished) game from localStorage;
 * persist on every transition; update the streak when the day finishes.
 */

import { useState, type CSSProperties } from 'react'
import type { GameState, Guess, Location, RoundResult } from '../types'
import { MapGuess } from './MapGuess'
import { Results } from './Results'
import { scoreGuess, formatDistance } from '../lib/scoring'
import {
  loadState,
  saveState,
  STORAGE_VERSION,
  type PersistedState,
} from '../lib/storage'

export interface GameProps {
  dateKey: string
  /** The 5 locations selected for today (from selectDailyLocations). */
  locations: Location[]
}

// St. Pete play area — locks the map so guesses stay in-bounds.
// TODO: confirm/adjust with Alex (docs/QUESTIONS-FOR-ALEX.md).
export const ST_PETE_BOUNDS: [[number, number], [number, number]] = [
  [27.62, -82.78],
  [27.86, -82.58],
]

/** UTC date key for the day before `dateKey`. */
function previousDateKey(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function nextStreak(
  prev: PersistedState['streak'],
  dateKey: string,
): PersistedState['streak'] {
  let current: number
  if (prev.lastPlayedDateKey === dateKey)
    current = prev.current // replay safety
  else if (prev.lastPlayedDateKey === previousDateKey(dateKey))
    current = prev.current + 1
  else current = 1
  return {
    current,
    best: Math.max(prev.best, current),
    lastPlayedDateKey: dateKey,
  }
}

function freshGame(dateKey: string, locations: Location[]): GameState {
  return { dateKey, locations, roundIndex: 0, results: [], phase: 'guessing' }
}

export function Game({ dateKey, locations }: GameProps) {
  const [game, setGame] = useState<GameState>(() => {
    const p = loadState()
    if (p.current && p.current.dateKey === dateKey) return p.current
    return freshGame(dateKey, locations)
  })
  const [guess, setGuess] = useState<Guess | null>(null)
  const [streak, setStreak] = useState(() => loadState().streak)

  const currentLocation = game.locations[game.roundIndex]
  const lastResult: RoundResult | undefined =
    game.results[game.results.length - 1]
  const totalScore = game.results.reduce((sum, r) => sum + r.score, 0)
  const isLastRound = game.roundIndex === game.locations.length - 1

  /** Persist the game; on finalize, also record the day + bump the streak. */
  function persist(next: GameState, finalize = false) {
    const p = loadState()
    let history = p.history
    let st = p.streak
    if (finalize && !history.some((h) => h.dateKey === next.dateKey)) {
      const total = next.results.reduce((sum, r) => sum + r.score, 0)
      history = [
        ...history,
        {
          dateKey: next.dateKey,
          totalScore: total,
          results: next.results.map((r) => ({
            distanceMeters: r.distanceMeters,
            score: r.score,
          })),
        },
      ]
      st = nextStreak(p.streak, next.dateKey)
      setStreak(st)
    }
    saveState({ version: STORAGE_VERSION, current: next, history, streak: st })
  }

  function submitGuess() {
    if (game.phase !== 'guessing' || !guess) return
    const { distanceMeters, score } = scoreGuess(currentLocation, guess)
    const result: RoundResult = {
      location: currentLocation,
      guess,
      distanceMeters,
      score,
    }
    const next: GameState = {
      ...game,
      results: [...game.results, result],
      phase: 'revealed',
    }
    setGame(next)
    persist(next)
  }

  function advance() {
    if (game.phase !== 'revealed') return
    if (isLastRound) {
      const next: GameState = { ...game, phase: 'finished' }
      setGame(next)
      persist(next, true)
    } else {
      const next: GameState = {
        ...game,
        roundIndex: game.roundIndex + 1,
        phase: 'guessing',
      }
      setGuess(null)
      setGame(next)
      persist(next)
    }
  }

  if (game.phase === 'finished') {
    return (
      <Results
        dateKey={game.dateKey}
        results={game.results}
        totalScore={totalScore}
        streak={streak}
      />
    )
  }

  const revealed = game.phase === 'revealed'

  return (
    <section style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ opacity: 0.7 }}>
          Round {game.roundIndex + 1} of {game.locations.length}
        </span>
        <span style={{ opacity: 0.7 }}>
          Score {totalScore.toLocaleString('en-US')}
        </span>
      </div>

      <h2 style={{ margin: '8px 0 2px' }}>{currentLocation.name}</h2>
      {currentLocation.clue && (
        <p style={{ marginTop: 0, opacity: 0.8 }}>{currentLocation.clue}</p>
      )}
      <p style={{ marginTop: 0, fontSize: 14, opacity: 0.6 }}>
        {revealed
          ? 'The green marker is the real spot.'
          : 'Tap the map where you think it is, then submit.'}
      </p>

      <MapGuess
        bounds={ST_PETE_BOUNDS}
        guess={guess}
        onGuessChange={setGuess}
        locked={revealed}
        resetViewKey={game.roundIndex}
        reveal={
          revealed && lastResult
            ? {
                location: lastResult.location,
                distanceMeters: lastResult.distanceMeters,
              }
            : null
        }
      />

      {revealed && lastResult ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{formatDistance(lastResult.distanceMeters)}</strong> away ·{' '}
            <strong>{lastResult.score.toLocaleString('en-US')}</strong> pts
          </p>
          <button onClick={advance} style={primaryButton}>
            {isLastRound ? 'See results' : 'Next round'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={submitGuess}
            disabled={!guess}
            style={{ ...primaryButton, opacity: guess ? 1 : 0.5 }}
          >
            Submit guess
          </button>
        </div>
      )}
    </section>
  )
}

const primaryButton: CSSProperties = {
  padding: '10px 16px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#f4b400',
  color: '#0f1720',
  cursor: 'pointer',
}
