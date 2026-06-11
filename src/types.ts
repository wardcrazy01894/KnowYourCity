/**
 * Core domain types for KnowYourCity.
 *
 * These are the shared contracts between the data pipeline, the game logic,
 * and the React components. Keep them stable — changing `Location` means
 * regenerating locations.json; changing `PersistedState` means bumping
 * STORAGE_VERSION in src/lib/storage.ts.
 */

/** A single guessable place. Mirrors one entry in a public/locations.<city>.json. */
export interface Location {
  /** Stable kebab-case slug, unique within the city. Used as a localStorage key. */
  id: string
  /** Display name shown to the player, e.g. "Sunken Gardens". */
  name: string
  lat: number
  lng: number
  /** Coarse bucket used for filtering/curation; not shown as a hint by default. */
  category: LocationCategory
  /**
   * Guessing difficulty, derived from a city-relative fame score (see the fame
   * pass in docs/DATA-SOURCING.md). Drives the daily 2-easy/2-medium/1-hard plan.
   * Optional because cities are enriched one at a time — a dataset without it
   * falls back to the legacy category plan. See src/lib/daily.ts.
   */
  difficulty?: Difficulty
  /**
   * Whether this location is in the daily play set. When a city sets a `playCap`
   * (see cities.json), only the top-`playCap` rows by fame are `inPlay: true` and
   * carry a `difficulty`; the rest are kept in the dataset (for provenance and a
   * quick re-cap) as `inPlay: false` with NO `difficulty`. Absent = in play
   * (uncapped cities). The daily selection (src/lib/daily.ts) filters on this.
   */
  inPlay?: boolean
  /**
   * City-relative fame 0–100 from the fame pass (docs/DATA-SOURCING.md §4b),
   * carried onto the row so the play cap can be re-derived without re-running the
   * research. Present on enriched cities; absent on unscored ones.
   */
  fameScore?: number
  /** Optional one-line hint shown under the name. */
  clue?: string | null
  /**
   * Optional image for FUTURE photo-mode rounds (e.g. a Don CeSar photo).
   * Not rendered in v1. When set, must be a freely-licensed image URL.
   */
  photoUrl?: string | null
  /** Provenance: where this row came from in the pipeline. */
  source: 'overpass' | 'wikidata' | 'manual'
  /** Per-row attribution string (license obligation). */
  attribution: string
}

/** Guessing difficulty, from easiest (most locally famous) to hardest (obscure). */
export type Difficulty = 'easy' | 'medium' | 'hard'

export type LocationCategory =
  | 'attraction'
  | 'museum'
  | 'park'
  | 'landmark'
  | 'restaurant'
  | 'bar'
  | 'cafe'
  | 'golf_course'
  | 'plaza'
  | 'venue'
  | 'other'

/** The full bundled dataset shape (public/locations.<city>.json). */
export interface LocationsFile {
  version: number
  city: string
  attribution: string
  locations: Location[]
}

/** A player's single guess for one round. */
export interface Guess {
  lat: number
  lng: number
}

/** The scored outcome of one round. */
export interface RoundResult {
  location: Location
  guess: Guess
  /** Great-circle distance between guess and truth, in meters. */
  distanceMeters: number
  /** Score for this round, integer 0..MAX_ROUND_SCORE. */
  score: number
}

/** Status of the in-progress daily game. */
export type GamePhase = 'guessing' | 'revealed' | 'finished'

/** Full state of today's game session (also the shape persisted to localStorage). */
export interface GameState {
  /** Date key, "YYYY-MM-DD" in the city's timezone — see daily.ts:getDateKey. */
  dateKey: string
  /** The 5 locations selected for today, in play order. */
  locations: Location[]
  /** Index of the current round, 0..locations.length. */
  roundIndex: number
  /** Completed round results so far. */
  results: RoundResult[]
  phase: GamePhase
}

/** Per-day record kept in history for streak calculation. */
export interface DayRecord {
  dateKey: string
  totalScore: number
  results: Array<Pick<RoundResult, 'distanceMeters' | 'score'>>
}
