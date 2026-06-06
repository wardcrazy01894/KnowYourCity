/**
 * Game — orchestrates the 5-round daily flow for the selected locations.
 *
 * Flow per round:
 *   1. Show the location NAME (+ optional clue). phase = 'guessing'.
 *   2. Player places a pin on <MapGuess/> and hits "Submit guess".
 *   3. Compute distance+score (src/lib/scoring.ts), phase = 'revealed':
 *      MapGuess shows truth + line; show "Next".
 *   4. After the last round, phase = 'finished' → render <Results/>.
 *
 * Persistence: on mount, attempt to resume today's in-progress GameState from
 * storage (matching dateKey); on each submit, persist progress; on finish,
 * append a DayRecord and update the streak. See src/lib/storage.ts.
 */

import type { Location } from '../types'
// import { MapGuess } from './MapGuess'
// import { Results } from './Results'
// import { scoreGuess } from '../lib/scoring'

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

export function Game(_props: GameProps) {
  // TODO: useReducer over GameState; render current round UI or <Results/>.
  return <section data-stub="Game" style={{ padding: 16 }}>Game goes here.</section>
}
