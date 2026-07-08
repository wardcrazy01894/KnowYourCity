/**
 * Cloudflare Worker: receive a bug report from the app and file a GitHub issue.
 *
 * Keeps the GitHub token server-side (never in the client bundle). Deploy with
 * Wrangler — see worker/README.md. The app points VITE_BUG_ENDPOINT at this URL.
 *
 * SECURITY: this is a public, unauthenticated endpoint. Hardening here (and the
 * "go live" checklist in worker/README.md) addresses the abuse vectors:
 *   - spam/flooding        → Turnstile (if configured) + KV per-IP rate limit
 *   - content injection    → defang() neutralizes @mentions and code fences so a
 *                            report can't ping users or break out of the body
 *   - phishing links       → ctx.url kept only if it matches the site origin
 *   - XSS-pivot from other  → server-side Origin allowlist (not just CORS)
 *     sites
 *   - giant payloads       → size cap on bytes read (+ Content-Length early
 *                            reject) + field length caps
 *   - token blast radius   → fine-grained PAT, Issues:write, single repo (README)
 *
 * Vars / secrets (wrangler.toml [vars] or `wrangler secret put`):
 *   GH_TOKEN          (secret) fine-grained PAT, Issues: read & write, this repo
 *   GH_REPO           "owner/repo" to file issues in (a PRIVATE triage repo is
 *                     safest — keeps spam/injected content out of public view)
 *   ALLOWED_ORIGIN    e.g. "https://knowyourcity.gg" ("*" disables the
 *                     Origin check — dev only)
 *   TURNSTILE_SECRET  (secret, optional) enables Cloudflare Turnstile verification
 *   RL                (optional KV namespace binding) enables per-IP rate limiting
 */

const MAX_BODY_BYTES = 20_000
const MAX_MESSAGE = 2_000
const MAX_LOGS = 6_000
// KV-fallback rate limit: max reports per IP per RL_WINDOW_SECONDS. Kept in step
// with the native [[ratelimits]] binding (5 per 60s) in wrangler.toml.
const RL_MAX = 5
const RL_WINDOW_SECONDS = 60

/** ALLOWED_ORIGIN may be "*" or a comma-separated list of origins. */
export function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
export function originAllowed(env, origin) {
  const list = allowedOrigins(env)
  return list.includes('*') || (origin && list.includes(origin))
}
export function cors(env, origin) {
  const list = allowedOrigins(env)
  // Reflect the request origin when it's allowed (can't use "*" + a specific
  // list); fall back to the first configured origin.
  const allow = list.includes('*')
    ? '*'
    : origin && list.includes(origin)
      ? origin
      : list[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

/** Neutralize report text so it can't ping users, break out of its block, or
 *  inject a DISGUISED live link/image into the (potentially public) issue:
 *  @mentions, code fences, and Markdown link/image syntax. We break the markers
 *  with a zero-width space (U+200B):
 *    - `![`  → defuses every image (inline + reference), so no auto-loading
 *      tracking-beacon.
 *    - `](`  → defuses inline links/images (`[text](url)`).
 *    - `][`  → defuses reference-style links (`[text][ref]`), and the
 *      line-leading `[ref]:` definition is broken too, so a `[click][1]` /
 *      `[1]: https://evil` pair can't render as a link whose text hides its
 *      destination.
 *  Raw HTML gets the same treatment via entity-escaping `<`/`>`: GitHub's
 *  issue-body sanitizer strips unsafe ATTRIBUTES (onerror, javascript:) but
 *  keeps allowed TAGS, so an un-escaped `<a href="https://evil">text</a>`
 *  would render as a live disguised link and `<img>` as an auto-loading
 *  beacon. Issue cross-references (`#123`/`GH-123`) are ZWSP-broken too, so a
 *  report can't spray backlink notifications across the tracker.
 *  Disguised links/images thus render as inert plain text (the report stays
 *  readable). Note this does NOT stop a *bare* URL — GitHub auto-linkifies
 *  `https://…` and we leave it visible so triagers can read it; it's the
 *  hidden-destination case we defang. A PRIVATE triage repo (per GH_REPO above)
 *  remains the recommended defense-in-depth while GH_REPO points at the
 *  public repo. */
export function defang(s) {
  return String(s)
    .replace(/```/g, '`​`​`')
    .replace(/@/g, '@​')
    .replace(/!\[/g, '!​[')
    .replace(/\]\(/g, ']​(')
    .replace(/\]\[/g, ']​[')
    .replace(/^(\s*\[[^\]]+\]):/gm, '$1​:')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/#(\d)/g, '#​$1')
    .replace(/\bGH-(\d)/g, 'GH-​$1')
    .replace(/\r/g, '')
}

/** True if `url` parses and its origin is EXACTLY one of the allowed origins.
 *  A prefix check (startsWith) would let lookalike hosts through, e.g.
 *  https://knowyourcity.gg.evil.com — a phishing link in a public issue. */
export function urlFromAllowedOrigin(url, origins) {
  try {
    return origins.includes(new URL(url).origin)
  } catch {
    return false
  }
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
    // Distinguish a siteverify NETWORK failure from a genuine bot rejection
    // (both return false → 403): an unreachable siteverify silently blocks
    // every legit reporter, which would otherwise be invisible.
    console.warn('bug-report turnstile siteverify network error', {
      error: String(e),
    })
    return false
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    const headers = cors(env, origin)
    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405, headers)

    // Fail CLOSED: refuse to operate unless at least one anti-abuse control is
    // configured (a rate limiter or Turnstile). Prevents an accidental
    // wide-open, spammable deploy. See worker/README.md.
    if (!env.RATE_LIMITER && !env.RL && !env.TURNSTILE_SECRET)
      return json(
        { error: 'reporting disabled: configure a rate limit or Turnstile' },
        503,
        headers,
      )

    // Server-side Origin allowlist (CORS headers alone are browser-only and
    // don't stop curl; this stops XSS-pivot from other origins in a browser).
    if (origin && !originAllowed(env, origin))
      return json({ error: 'forbidden origin' }, 403, headers)

    // Cheap early reject on the declared size. Clients can omit Content-Length,
    // so the authoritative cap is on the bytes actually read (below).
    const len = parseInt(request.headers.get('Content-Length') || '0', 10)
    if (len > MAX_BODY_BYTES)
      return json({ error: 'payload too large' }, 413, headers)

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

    // Per-IP rate limit. Prefer Cloudflare's native Rate Limiting binding;
    // fall back to a KV counter if an `RL` namespace is bound instead.
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip })
      if (!success)
        return json({ error: 'rate limited, try later' }, 429, headers)
    } else if (env.RL) {
      const key = `rl:${ip}`
      const n = parseInt((await env.RL.get(key)) || '0', 10)
      if (n >= RL_MAX)
        return json({ error: 'rate limited, try later' }, 429, headers)
      await env.RL.put(key, String(n + 1), {
        expirationTtl: RL_WINDOW_SECONDS,
      })
    }

    let body
    try {
      const raw = await request.text()
      // Enforce the size cap on the bytes read, not just the header.
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
        return json({ error: 'payload too large' }, 413, headers)
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'invalid json' }, 400, headers)
    }

    // Bot check (if Turnstile is configured).
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(
        body?.turnstileToken,
        env.TURNSTILE_SECRET,
        ip,
      )
      if (!ok) return json({ error: 'verification failed' }, 403, headers)
    }

    const message = String(body?.message ?? '')
      .slice(0, MAX_MESSAGE)
      .trim()
    if (!message) return json({ error: 'empty message' }, 400, headers)

    const ctx = body?.context ?? {}
    const logs = String(body?.logs ?? '').slice(0, MAX_LOGS)

    // Keep the reported URL only if it's from our own site (else it's a
    // potential attacker-planted phishing link in a public issue).
    const url = String(ctx.url ?? '')
    const origins = allowedOrigins(env)
    const safeUrl = origins.includes('*')
      ? defang(url)
      : urlFromAllowedOrigin(url, origins)
        ? url
        : '(omitted)'

    const title =
      '[bug] ' +
      (message.split('\n')[0] || '')
        .replace(/[`@\r\n]/g, ' ')
        .slice(0, 80)
        .trim()

    const issueBody = [
      defang(message),
      '',
      '---',
      `City: ${defang(ctx.city ?? '?')}`,
      `Puzzle: ${defang(ctx.date ?? '?')}`,
      `URL: ${safeUrl}`,
      `Browser: ${defang(ctx.userAgent ?? '')}`,
      '',
      '<details><summary>session logs</summary>',
      '',
      '```',
      defang(logs) || '(none)',
      '```',
      '</details>',
    ].join('\n')

    let res
    try {
      res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'KnowYourCity-bug-bot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: ['bug', 'from-app'],
        }),
      })
    } catch (e) {
      // Network throw / timeout reaching GitHub — without this the worker 500s
      // with no trace; intake silently breaks. Log it. (Never the token.)
      console.error('bug-report github issue create threw', {
        error: String(e),
      })
      return json({ error: 'github error' }, 502, headers)
    }
    if (!res.ok) {
      // Log status AND the GitHub error body so a broken intake (expired PAT,
      // archived repo, secondary rate limit) is diagnosable from logs alone.
      const detail = await res.text().catch(() => '')
      console.error('bug-report github issue create failed', {
        status: res.status,
        body: detail.slice(0, 300),
      })
      return json({ error: 'github error', status: res.status }, 502, headers)
    }
    const issue = await res.json()
    return json({ ok: true, url: issue.html_url }, 200, headers)
  },
}
