/**
 * Anonymous daily leaderboard — client side.
 *
 * On finishing the OFFICIAL daily challenge, the app submits the day's total to
 * the leaderboard Worker (see worker/leaderboard.mjs) and shows "you placed Xth
 * of Y today". No accounts, no names: identity is an anonymous random UUID kept
 * in localStorage (`kyc:clientId`) — the seam a future login would link to.
 *
 * INTEGRITY: only the official daily challenge counts. Shuffle mode (?shuffle)
 * and date overrides (?date=) are NOT submitted — their scores would pollute the
 * real board with results from a different set of places. That gate is the
 * `official` flag, set by App.resolveMode and threaded down to here.
 *
 * GRACEFUL: every failure path (endpoint unset, offline, non-official game, bad
 * response) resolves to `null` so the Results screen simply omits the line — the
 * leaderboard can never block or break the game.
 */

const CLIENT_ID_KEY = 'kyc:clientId'
const CACHE_PREFIX = 'kyc:lb:v1'

/** A per-player streak, computed and stored server-side (keyed by the anonymous
 *  device id; the accounts-ready record). */
export interface Streak {
  current: number
  best: number
}

export interface Standing {
  /** 1-based competition rank (ties share a rank). */
  rank: number
  /** Total entries for this city + day. */
  total: number
  /** The player's server-side streak after this submission, when available. */
  streak?: Streak
}

/**
 * Only surface a "top X%" once the field is big enough for a percentile to mean
 * anything (below this, "3rd of 7" is clearer than "top 43%").
 */
export const PERCENTILE_MIN_TOTAL = 20

/** Random id used when crypto.randomUUID or storage is unavailable. */
function fallbackId(): string {
  return (
    'kyc-' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 36)
}

/**
 * The stable anonymous device id, created once and reused. This is what a future
 * account would adopt/link, so it lives at a top-level key (not per-city/day).
 */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : fallbackId()
    localStorage.setItem(CLIENT_ID_KEY, id)
    return id
  } catch {
    // Storage blocked (private mode) — degrade to an ephemeral id.
    return fallbackId()
  }
}

/** English ordinal: 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** "Top X%" for a rank within a field — rank 1 of 100 → 1, clamped to ≥1. */
export function percentile(rank: number, total: number): number {
  if (total <= 0) return 100
  return Math.min(100, Math.max(1, Math.round((rank / total) * 100)))
}

/** Human standing line for the Results screen. Pure. */
export function formatStanding({ rank, total }: Standing): string {
  if (total <= 1) return 'You’re the first to finish today!'
  const base = `You placed ${ordinal(rank)} of ${total.toLocaleString(
    'en-US',
  )} today`
  return total >= PERCENTILE_MIN_TOTAL
    ? `${base} · top ${percentile(rank, total)}%`
    : base
}

const cacheKey = (cityId: string, dateKey: string) =>
  `${CACHE_PREFIX}:${cityId}:${dateKey}`

/** Read a previously-returned standing for this city+day, or null. */
export function readStanding(cityId: string, dateKey: string): Standing | null {
  try {
    const raw = localStorage.getItem(cacheKey(cityId, dateKey))
    if (!raw) return null
    const s = JSON.parse(raw) as Standing
    return typeof s?.rank === 'number' && typeof s?.total === 'number'
      ? s
      : null
  } catch {
    return null
  }
}

function writeStanding(cityId: string, dateKey: string, s: Standing): void {
  try {
    localStorage.setItem(cacheKey(cityId, dateKey), JSON.stringify(s))
  } catch {
    /* best-effort */
  }
}

export interface SubmitArgs {
  cityId: string
  dateKey: string
  score: number
  /** True only for the real daily challenge — false for shuffle / date override. */
  official: boolean
  /** Cloudflare Turnstile token, when the widget is enabled (optional in v1). */
  turnstileToken?: string
}

/** The JSON body POSTed to the leaderboard endpoint. Pure + testable. */
export function buildSubmitPayload(args: SubmitArgs) {
  return {
    city: args.cityId,
    date: args.dateKey,
    score: args.score,
    clientId: getClientId(),
    turnstileToken: args.turnstileToken,
  }
}

/**
 * Submit today's official score and resolve the player's standing — or `null`
 * when the leaderboard shouldn't/can't run (non-official game, no endpoint,
 * offline, bad response). A cached standing short-circuits the network so a
 * reload doesn't re-POST; the Worker UPSERT is idempotent (keep-max) so even a
 * racing duplicate POST is harmless.
 */
export async function submitDailyScore(
  args: SubmitArgs,
): Promise<Standing | null> {
  if (!args.official) return null
  const endpoint = import.meta.env.VITE_LEADERBOARD_ENDPOINT
  if (!endpoint) return null

  const cached = readStanding(args.cityId, args.dateKey)
  if (cached) return cached

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSubmitPayload(args)),
    })
    if (!r.ok) return null
    const data = (await r.json().catch(() => null)) as Standing | null
    if (typeof data?.rank !== 'number' || typeof data?.total !== 'number')
      return null
    const standing: Standing = { rank: data.rank, total: data.total }
    if (
      data.streak &&
      typeof data.streak.current === 'number' &&
      typeof data.streak.best === 'number'
    )
      standing.streak = { current: data.streak.current, best: data.streak.best }
    writeStanding(args.cityId, args.dateKey, standing)
    return standing
  } catch {
    return null
  }
}

export interface LeaderboardData {
  /** Total entries for the city + day. */
  total: number
  /** The day's scores, highest first, capped at the server's TOP_LIMIT. */
  scores: number[]
}

/**
 * Fetch the day's leaderboard (top scores + total) for a city. Read-only and
 * anonymous — the server returns scores only, never ids or names. Resolves
 * `null` when the leaderboard is off/unavailable so the caller can show a
 * friendly empty state instead of breaking.
 */
export async function fetchLeaderboard(
  cityId: string,
  dateKey: string,
): Promise<LeaderboardData | null> {
  const endpoint = import.meta.env.VITE_LEADERBOARD_ENDPOINT
  if (!endpoint) return null
  try {
    const u = new URL(endpoint)
    u.searchParams.set('city', cityId)
    u.searchParams.set('date', dateKey)
    const r = await fetch(u.toString())
    if (!r.ok) return null
    const data = (await r.json().catch(() => null)) as LeaderboardData | null
    if (!data || !Array.isArray(data.scores) || typeof data.total !== 'number')
      return null
    return {
      total: data.total,
      scores: data.scores.filter((s) => typeof s === 'number'),
    }
  } catch {
    return null
  }
}

/**
 * Recompute the player's standing for DISPLAY from a fresh read of the board.
 *
 * The submit-time standing is cached write-once (so a reload never re-POSTs),
 * which means "Nth of Y · top Z%" would otherwise freeze at the moment the
 * player finished — stale by evening once hundreds more have played. This keeps
 * the cached submit (and its server streak) but refreshes the numbers:
 *
 *  - `total` is always taken from the fresh read.
 *  - `rank` is recomputed EXACTLY when the player's score still falls within the
 *    returned top-N window (always true when they placed in the top N): every
 *    score above theirs is then guaranteed to be in the window, so
 *    `1 + count(scores > yourScore)` is their true competition rank.
 *  - When the player placed BELOW the returned (capped) window, an exact rank
 *    can't be derived from a capped list, so the cached submit rank is kept
 *    (floored at window + 1). That branch only happens past the server TOP_LIMIT.
 *
 * Pure.
 */
export function refreshStanding(
  cached: Standing,
  fresh: LeaderboardData,
  yourScore: number,
): Standing {
  const total = Math.max(fresh.total, 1)
  const returned = fresh.scores.length
  const greater = fresh.scores.filter((s) => s > yourScore).length
  // Capped iff the server returned fewer rows than the true total.
  const capped = returned < fresh.total
  const smallestReturned = returned > 0 ? Math.min(...fresh.scores) : Infinity
  const inWindow = !capped || yourScore >= smallestReturned
  const rank = inWindow ? greater + 1 : Math.max(cached.rank, returned + 1)
  const out: Standing = { rank, total }
  if (cached.streak) out.streak = cached.streak
  return out
}

export interface LeaderboardRow {
  /** 1-based competition rank (ties share a rank). */
  rank: number
  score: number
  /** True for (the first occurrence of) the viewer's own score. */
  you: boolean
}

/**
 * Turn a desc-sorted score list into ranked rows. Ties share a rank (standard
 * competition ranking: 480, 480, 420 → ranks 1, 1, 3). When `yourScore` is
 * given, the FIRST row matching it is flagged `you` (anonymous play can't
 * distinguish tied players, so we highlight one). Pure.
 */
export function buildLeaderboardRows(
  scores: number[],
  yourScore?: number,
): LeaderboardRow[] {
  const sorted = [...scores].sort((a, b) => b - a)
  let youMarked = false
  let prevScore: number | null = null
  let prevRank = 0
  return sorted.map((score, i) => {
    const rank = prevScore !== null && score === prevScore ? prevRank : i + 1
    prevScore = score
    prevRank = rank
    const you = !youMarked && yourScore !== undefined && score === yourScore
    if (you) youMarked = true
    return { rank, score, you }
  })
}
