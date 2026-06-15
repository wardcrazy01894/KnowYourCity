/**
 * Pure helpers + constants for the leaderboard Worker.
 *
 * These live in a SEPARATE module (not the Worker entry) on purpose: the Workers
 * runtime enumerates the *entry* module's named exports and rejects any that
 * aren't a function/ExportedHandler — so a `export const MAX_TOTAL = 500` in the
 * entry crashes the worker at boot. Keeping constants + validation here lets the
 * entry (leaderboard.mjs) export only `default`, and keeps everything unit
 * testable without a Worker or a database (leaderboard.test.mjs).
 */

/** Perfect day = 5 rounds × 100. Kept in step with the client's
 *  ROUNDS_PER_DAY × MAX_ROUND_SCORE (src/lib/daily.ts, src/lib/scoring.ts). */
export const MAX_TOTAL = 500

/**
 * City → IANA timezone. The worker recomputes the city-local date itself to
 * validate submissions, so this MUST be kept in step with cities.json. (Only the
 * timezone is needed here; the rest of a city's config stays client-side.)
 */
export const CITY_TZ = {
  stpete: 'America/New_York',
  statecollege: 'America/New_York',
  annarbor: 'America/Detroit',
  seattle: 'America/Los_Angeles',
  chicago: 'America/Chicago',
}

/** City-local calendar day ("YYYY-MM-DD") for `now` — mirrors the client's
 *  getDateKey (src/lib/daily.ts) so client and server agree on the rollover. */
export function dateKeyFor(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
}

/**
 * The set of city-local date keys we accept for `now`: yesterday, today, and
 * tomorrow in the city's timezone. The ±1-day window tolerates clock skew, the
 * midnight rollover (a player who started before and finished after), and DST
 * transitions, while still rejecting attempts to seed arbitrary days.
 */
export function validDateKeys(now, timeZone) {
  const DAY = 86_400_000
  return new Set([
    dateKeyFor(new Date(now.getTime() - DAY), timeZone),
    dateKeyFor(now, timeZone),
    dateKeyFor(new Date(now.getTime() + DAY), timeZone),
  ])
}

/** True for a real integer total in [0, MAX_TOTAL]. Rejects NaN/floats/strings. */
export function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= MAX_TOTAL
}

/** Anonymous device id shape: UUID-ish, kept short and charset-safe. */
export function isValidClientId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)
}

/** True if `key` is a REAL calendar date in YYYY-MM-DD form (mirrors the
 *  client's isValidDateKey — rejects 2026-99-99 etc. via a UTC round-trip). */
export function isValidDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = new Date(key + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key
}

/** Max rows the view endpoint returns — caps the read so a busy day stays cheap
 *  and the anonymous list can't be scraped wholesale. */
export const TOP_LIMIT = 100

/**
 * Validate a leaderboard VIEW query (read-only). Any real past/today/future date
 * is allowed (read-only, capped), but the city must be known. Pure.
 */
export function validateView(query) {
  const city = String(query?.city ?? '')
  if (!CITY_TZ[city]) return { ok: false, status: 400, error: 'unknown city' }
  const date = String(query?.date ?? '')
  if (!isValidDateKey(date))
    return { ok: false, status: 400, error: 'invalid date' }
  return { ok: true, value: { city, date } }
}

/**
 * Validate + normalize a submission against the server's clock. Returns
 * `{ ok: true, value }` or `{ ok: false, status, error }`. Pure given `now`, so
 * every branch (unknown city, out-of-window date, bad score/id) is unit-testable
 * without a Worker or a database.
 */
export function validateSubmission(body, now = new Date()) {
  const city = String(body?.city ?? '')
  const timeZone = CITY_TZ[city]
  if (!timeZone) return { ok: false, status: 400, error: 'unknown city' }

  const date = String(body?.date ?? '')
  if (!validDateKeys(now, timeZone).has(date))
    return { ok: false, status: 400, error: 'date out of range' }

  const score = body?.score
  if (!isValidScore(score))
    return { ok: false, status: 400, error: 'invalid score' }

  const clientId = body?.clientId
  if (!isValidClientId(clientId))
    return { ok: false, status: 400, error: 'invalid clientId' }

  return { ok: true, value: { city, date, score, clientId } }
}

/**
 * UPSERT the device's score (keep the MAX — a replay can't lower it) and read
 * back the standing in one atomic D1 batch. Rank counts strictly-higher stored
 * scores, so ties share a rank (standard competition ranking) and rank = better
 * + 1. The inner subquery reads the *stored* score, so a stray lower re-submit
 * still ranks against the kept (higher) score.
 */
export async function upsertAndRank(db, { city, date, clientId, score }, now) {
  const upsert = db
    .prepare(
      `INSERT INTO scores (city, date, client_id, score, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(city, date, client_id) DO UPDATE SET
         score = MAX(score, excluded.score),
         updated_at = excluded.updated_at`,
    )
    .bind(city, date, clientId, score, now)
  const standing = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM scores s
            WHERE s.city = ?1 AND s.date = ?2
              AND s.score > (SELECT score FROM scores
                             WHERE city = ?1 AND date = ?2 AND client_id = ?3)
         ) AS better,
         (SELECT COUNT(*) FROM scores WHERE city = ?1 AND date = ?2) AS total`,
    )
    .bind(city, date, clientId)
  const results = await db.batch([upsert, standing])
  const row = results[1].results[0]
  return { rank: Number(row.better) + 1, total: Number(row.total) }
}

/**
 * How long a day's scores are kept. Old daily boards have no value once the day
 * passes, so a scheduled prune (see the worker's `scheduled` handler) deletes
 * rows older than this, keeping the table bounded no matter how busy it gets.
 * NOTE: this only prunes `scores`; per-player streaks live in their own table so
 * a long streak survives even after its early daily rows are pruned.
 */
export const RETENTION_DAYS = 90

/**
 * The oldest date key to KEEP — anything strictly before this is pruned. Uses a
 * UTC-based offset; a few hours of timezone slack is irrelevant at a 90-day
 * horizon, and date keys are ISO strings so a lexical `<` compares correctly.
 * Pure given `now`.
 */
export function cutoffDateKey(now, days = RETENTION_DAYS) {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Delete daily scores older than `cutoff` (YYYY-MM-DD). Returns rows removed. */
export async function pruneOldScores(db, cutoff) {
  const res = await db
    .prepare(`DELETE FROM scores WHERE date < ?1`)
    .bind(cutoff)
    .run()
  return res?.meta?.changes ?? 0
}

/** The calendar day before `dateKey` ("YYYY-MM-DD"), via a UTC round-trip.
 *  Mirrors the client's previousDateKey (src/components/Game.tsx). */
export function previousDateKey(dateKey) {
  const d = new Date(dateKey + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Advance a per-player streak to account for playing `dateKey`. Mirrors the
 * client's nextStreak: same-day replay keeps the count, the immediately previous
 * day increments, any other gap resets to 1; `best` is the running max. Pure —
 * `prev` is the stored row (or null for a first-ever play).
 */
export function advanceStreak(prev, dateKey) {
  let current
  if (!prev) current = 1
  else if (prev.last_played_date === dateKey)
    current = prev.current // replay safety
  else if (prev.last_played_date === previousDateKey(dateKey))
    current = prev.current + 1
  else current = 1
  return {
    current,
    best: Math.max(prev?.best ?? 0, current),
    last_played_date: dateKey,
  }
}

/**
 * Read → advance → upsert the player's streak for (city, client_id) on a daily
 * submission. Returns `{ current, best }`. Separate from the score write so a
 * streak hiccup never blocks the score; SQLite serializes the read/write and a
 * same-device double-submit converges to the same value.
 */
export async function updateStreak(db, { city, clientId, date }, now) {
  const prev = await db
    .prepare(
      `SELECT current, best, last_played_date FROM streaks
       WHERE city = ?1 AND client_id = ?2`,
    )
    .bind(city, clientId)
    .first()
  const next = advanceStreak(prev, date)
  await db
    .prepare(
      `INSERT INTO streaks (city, client_id, current, best, last_played_date, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(city, client_id) DO UPDATE SET
         current = excluded.current,
         best = excluded.best,
         last_played_date = excluded.last_played_date,
         updated_at = excluded.updated_at`,
    )
    .bind(city, clientId, next.current, next.best, next.last_played_date, now)
    .run()
  return { current: next.current, best: next.best }
}

/**
 * Read the day's top scores (desc, capped at TOP_LIMIT) plus the total entry
 * count for a city + date. Anonymous: scores only — no ids, no names. The client
 * assigns display ranks (ties share a rank) and highlights the player's own row.
 */
export async function topScores(db, city, date, limit = TOP_LIMIT) {
  const list = db
    .prepare(
      `SELECT score FROM scores
       WHERE city = ?1 AND date = ?2
       ORDER BY score DESC LIMIT ?3`,
    )
    .bind(city, date, limit)
  const count = db
    .prepare(
      `SELECT COUNT(*) AS total FROM scores WHERE city = ?1 AND date = ?2`,
    )
    .bind(city, date)
  const [listRes, countRes] = await db.batch([list, count])
  return {
    total: Number(countRes.results[0].total) || 0,
    scores: listRes.results.map((r) => Number(r.score)),
  }
}
