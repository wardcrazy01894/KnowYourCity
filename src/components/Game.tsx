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

import { useEffect, useState, type CSSProperties } from 'react'
import type { GameState, Guess, Location, RoundResult } from '../types'
import { MapGuess } from './MapGuess'
import { Results } from './Results'
import { scoreGuess, formatDistance } from '../lib/scoring'
import { playScoreSound } from '../lib/sound'
import { log } from '../lib/log'
import { loadState, saveState, STORAGE_VERSION } from '../lib/storage'
import { resolveInitialGame } from '../lib/resume'
import { lineupHash, recordCompletion } from '../lib/progress'

export interface GameProps {
  /** City id — namespaces saved state so streaks are per-city. */
  cityId: string
  /** City label for the results/share card, e.g. "Seattle". */
  cityShort: string
  /** Calendar date key (YYYY-MM-DD) in the city's timezone. */
  dateKey: string
  /** Map play bounds for this city, [[south, west], [north, east]]. */
  bounds: [[number, number], [number, number]]
  /** The 5 locations selected for today (from selectDailyLocations). */
  locations: Location[]
  /** True only for the official daily challenge — gates leaderboard submission. */
  official: boolean
}

// Clues are kept in the dataset but hidden by default for more challenge.
// Flip to true (or make it a setting) to show the one-line hint under the name.
const SHOW_CLUES = false

export function Game({
  cityId,
  cityShort,
  dateKey,
  bounds,
  locations,
  official,
}: GameProps) {
  // One read of saved state at mount, shared by both the game + streak init.
  const [initial] = useState(() => loadState(cityId))
  const [game, setGame] = useState<GameState>(() =>
    resolveInitialGame(initial.current, dateKey, locations),
  )
  const [guess, setGuess] = useState<Guess | null>(null)
  const [streak, setStreak] = useState(initial.streak)

  useEffect(() => {
    const resumed = game.phase !== 'guessing' || game.results.length > 0
    log.info('Game', resumed ? 'resumed today’s game' : 'started new game', {
      dateKey,
      round: game.roundIndex + 1,
      phase: game.phase,
    })
    // Log once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentLocation = game.locations[game.roundIndex]
  const lastResult: RoundResult | undefined =
    game.results[game.results.length - 1]
  const totalScore = game.results.reduce((sum, r) => sum + r.score, 0)
  const isLastRound = game.roundIndex === game.locations.length - 1

  /** Persist the game; on finalize, also record the day + bump the streak. */
  function persist(next: GameState, finalize = false) {
    const p = loadState(cityId)
    let history = p.history
    let st = p.streak
    if (finalize) {
      // Each distinct (date, lineup) completion is its own record: a replay of a
      // CHANGED official set adds a second record, both kept; the streak bumps
      // once per calendar date. See progress.ts:recordCompletion.
      const folded = recordCompletion(p.history, p.streak, {
        dateKey: next.dateKey,
        lineup: lineupHash(next.locations),
        totalScore: next.results.reduce((sum, r) => sum + r.score, 0),
        results: next.results.map((r) => ({
          distanceMeters: r.distanceMeters,
          score: r.score,
        })),
      })
      history = folded.history
      st = folded.streak
      setStreak(st)
    }
    saveState(cityId, {
      version: STORAGE_VERSION,
      current: next,
      history,
      streak: st,
    })
  }

  function submitGuess() {
    if (game.phase !== 'guessing' || !guess) return
    const { distanceMeters, score } = scoreGuess(currentLocation, guess)
    log.info('Game', 'guess submitted', {
      round: game.roundIndex + 1,
      name: currentLocation.name,
      distanceMeters: Math.round(distanceMeters),
      score,
    })
    playScoreSound(score)
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
      log.info('Game', 'day finished', { dateKey, totalScore })
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
        cityId={cityId}
        cityShort={cityShort}
        dateKey={game.dateKey}
        results={game.results}
        totalScore={totalScore}
        streak={streak}
        official={official}
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
      {SHOW_CLUES && currentLocation.clue && (
        <p style={{ marginTop: 0, opacity: 0.8 }}>{currentLocation.clue}</p>
      )}
      <p style={{ marginTop: 0, fontSize: 14, opacity: 0.6 }}>
        {revealed
          ? 'The green marker is the real spot.'
          : 'Tap the map where you think it is, then submit.'}
      </p>

      <MapGuess
        bounds={bounds}
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
