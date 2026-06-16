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
  /**
   * Optional polygon for large-footprint locations (parks, golf courses).
   * Stored as an **open ring** of [lat, lng] pairs — the first point is NOT
   * repeated at the end. Coordinates are rounded to 5 decimal places (≈ 1.1 m
   * precision), sufficient for a guessing game and cheaper than the 7-decimal
   * Overpass output.
   *
   * Only locations with `category: 'park' | 'golf_course'` carry a polygon.
   * Absent or empty → falls back to centroid-point scoring (backwards-compat:
   * old persisted game states never have this field and score correctly).
   *
   * Populated by `scripts/add-polygons.mjs` (OSM `out geom` re-query by name
   * within city bbox). See docs/DATA-SOURCING.md §4d and docs/plans/POLYGON-SCORING.md.
   *
   * [M-A1]
   */
  polygon?: [number, number][]
  /**
   * Optional `YYYY-MM-DD` date this venue was last confirmed current in a
   * freshness pass. For cafe/bar/restaurant it means Google Places
   * `business_status` came back OPERATIONAL; for parks/landmarks (no
   * `business_status`, and they don't "close") it means the venue was reviewed
   * and is a stable, still-present landmark. Lets us audit dataset staleness;
   * not used by gameplay. Deliberately left **unstamped** only where current
   * status is uncertain — chiefly `CLOSED_TEMPORARILY` businesses — so an absent
   * stamp on an in-play venue is a meaningful "needs a look" signal. Lives in the
   * **public dataset only**, not the `data/fame-<city>.json` cache. Preserved
   * across `apply-difficulty` re-runs (it's in `FIELD_ORDER`).
   */
  lastVerified?: string
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
  /**
   * Distance from the guess to the "target" in meters. Semantics vary by
   * location type:
   *  - **point locations**: great-circle (haversine) distance to the centroid.
   *  - **polygon locations, guess inside**: always 0 (the guess was inside the
   *    polygon — "0 m" is the honest display value).
   *  - **polygon locations, guess outside**: distance to the nearest polygon
   *    edge (NOT to the centroid).
   *
   * The UI shows `formatDistance(distanceMeters)`. For polygon inside-hits this
   * renders as "0 m". For polygon outside-hits the displayed distance is
   * "how far outside the boundary you were", which is more meaningful than the
   * centroid distance. See docs/plans/POLYGON-SCORING.md §3.4 and §7.6.
   */
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
