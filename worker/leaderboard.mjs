/**
 * Cloudflare Worker: anonymous daily leaderboard for KnowYourCity.
 *
 * Stores one score per (city, date, device) in D1 and answers "you placed Xth of
 * Y today". No accounts, no names, no PII — just an anonymous device UUID. The
 * schema reserves a `user_id` column so accounts can be layered on later (see
 * worker/migrations/0001_create_scores.sql and worker/README.md).
 *
 * Pure helpers + constants live in leaderboard-lib.mjs — NOT here — because the
 * Workers runtime rejects non-function named exports on the *entry* module. This
 * file therefore exports only `default`.
 *
 * SECURITY: like the bug-report worker, this is a public, unauthenticated
 * endpoint and shares its hardening helpers (cors / Origin allowlist). The abuse
 * surface here is *leaderboard inflation* — stuffing junk rows to distort the "of
 * Y" denominator. Mitigations:
 *   - fail CLOSED unless a rate limiter OR Turnstile is configured;
 *   - per-IP rate limit (native binding, KV fallback) caps a single source's
 *     write rate;
 *   - the server RE-derives the city-local date and rejects anything outside a
 *     ±1-day window, and rejects unknown city slugs — so you can't seed
 *     arbitrary past/future days or junk cities;
 *   - score must be an integer in [0, MAX_TOTAL].
 * Turnstile is plumbed through (verified when TURNSTILE_SECRET is set) but is
 * OPTIONAL in v1: the client submits automatically at end-of-day with no widget,
 * so requiring a token would need an invisible-widget execute. Consistent with
 * the project's documented anti-cheat NON-GOAL (docs/PLAN.md §6), v1 relies on
 * the rate limit and accepts that a determined actor could still inflate Y; the
 * Turnstile path is the documented next step if abuse appears.
 *
 * Bindings / vars (worker/wrangler.leaderboard.toml):
 *   DB               (D1 database) the scores table
 *   ALLOWED_ORIGIN   comma-separated origin allowlist (shared semantics with the
 *                    bug worker); "*" disables the check (dev only)
 *   RATE_LIMITER     (native rate-limit binding) preferred per-IP limiter
 *   RL               (optional KV namespace) per-IP limiter fallback
 *   TURNSTILE_SECRET (optional secret) when set, a valid token is required
 */

import { cors, originAllowed } from './bug-report.mjs'
import {
  validateSubmission,
  upsertAndRank,
  validateView,
  topScores,
  cutoffDateKey,
  pruneOldScores,
  updateStreak,
} from './leaderboard-lib.mjs'

const MAX_BODY_BYTES = 4_000
// KV-fallback rate limit, kept in step with the native [[ratelimits]] binding.
const RL_MAX = 30
const RL_WINDOW_SECONDS = 60

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false
  const form = new URLSearchParams({ secret, response: token })
  if (ip) form.set('remoteip', ip)
  try {
    const r = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form },
    )
    const data = await r.json()
    return Boolean(data.success)
  } catch (e) {
    // A siteverify NETWORK failure looks identical to a bot rejection (both
    // return false → 403). Log it distinctly so "every legit user is blocked"
    // is diagnosable from an unreachable-siteverify outage.
    console.warn('leaderboard turnstile siteverify network error', {
      error: String(e),
    })
    return false
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const headers = cors(env, origin)
    // POST submits a score; GET views the board. (The shared cors() helper
    // defaults to "POST, OPTIONS" — add GET for this worker's read endpoint.)
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'POST' && request.method !== 'GET')
      return json({ error: 'method not allowed' }, 405, headers)

    // Fail CLOSED: refuse to operate without at least one anti-abuse control.
    if (!env.RATE_LIMITER && !env.RL && !env.TURNSTILE_SECRET)
      return json(
        { error: 'leaderboard disabled: configure a rate limit or Turnstile' },
        503,
        headers,
      )

    // Server-side Origin allowlist (CORS headers alone don't stop curl).
    if (origin && !originAllowed(env, origin))
      return json({ error: 'forbidden origin' }, 403, headers)

    if (!env.DB) return json({ error: 'leaderboard unavailable' }, 503, headers)

    const len = parseInt(request.headers.get('Content-Length') || '0', 10)
    if (len > MAX_BODY_BYTES)
      return json({ error: 'payload too large' }, 413, headers)

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

    // Per-IP rate limit (native binding preferred, KV counter fallback).
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip })
      if (!success)
        return json({ error: 'rate limited, try later' }, 429, headers)
    } else if (env.RL) {
      const key = `rl:${ip}`
      const n = parseInt((await env.RL.get(key)) || '0', 10)
      if (n >= RL_MAX)
        return json({ error: 'rate limited, try later' }, 429, headers)
      await env.RL.put(key, String(n + 1), { expirationTtl: RL_WINDOW_SECONDS })
    }

    // GET — view the day's leaderboard (read-only, anonymous: scores only).
    if (request.method === 'GET') {
      const q = new URL(request.url).searchParams
      const vv = validateView({ city: q.get('city'), date: q.get('date') })
      if (!vv.ok) return json({ error: vv.error }, vv.status, headers)
      try {
        const board = await topScores(env.DB, vv.value.city, vv.value.date)
        return json({ ok: true, ...board }, 200, headers)
      } catch (e) {
        console.error('leaderboard read failed', {
          city: vv.value.city,
          date: vv.value.date,
          error: String(e),
        })
        return json({ error: 'leaderboard unavailable' }, 503, headers)
      }
    }

    let body
    try {
      const raw = await request.text()
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
        return json({ error: 'payload too large' }, 413, headers)
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'invalid json' }, 400, headers)
    }

    // Bot check (only when Turnstile is configured for this worker).
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(
        body?.turnstileToken,
        env.TURNSTILE_SECRET,
        ip,
      )
      if (!ok) return json({ error: 'verification failed' }, 403, headers)
    }

    const v = validateSubmission(body, new Date())
    if (!v.ok) return json({ error: v.error }, v.status, headers)

    try {
      const now = Date.now()
      const standing = await upsertAndRank(env.DB, v.value, now)
      // Advance the per-player streak. Best-effort: a streak failure must not
      // fail the score submission, so it's caught independently.
      let streak
      try {
        streak = await updateStreak(env.DB, v.value, now)
      } catch (e) {
        // Best-effort, but a PERSISTENT streak failure (e.g. a missing
        // migration) would silently strip everyone's streak — make it visible.
        console.warn('leaderboard streak update failed', {
          city: v.value.city,
          error: String(e),
        })
        streak = undefined
      }
      return json({ ok: true, ...standing, streak }, 200, headers)
    } catch (e) {
      // D1 outage / quota exhaustion — degrade gracefully; the client just
      // omits the leaderboard line. Never 500 on the player. Log it: this 503
      // was the missing signal when a failing submit had no server-side trace.
      console.error('leaderboard submit failed', {
        city: v.value.city,
        error: String(e),
      })
      return json({ error: 'leaderboard unavailable' }, 503, headers)
    }
  },

  /**
   * Cron Trigger (see [triggers] in wrangler.leaderboard.toml): prune daily
   * scores older than RETENTION_DAYS so the table stays bounded forever. Best
   * effort — a failure just retries next run; it never affects the live game.
   */
  async scheduled(_event, env, ctx) {
    if (!env.DB) return
    ctx.waitUntil(
      pruneOldScores(env.DB, cutoffDateKey(new Date())).catch((e) =>
        // A failure just retries next run, but a PERMANENT one (table grows
        // unbounded) must not be invisible.
        console.error('leaderboard prune failed', { error: String(e) }),
      ),
    )
  },
}
