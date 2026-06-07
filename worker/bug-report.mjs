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
 *   - giant payloads       → Content-Length + field length caps
 *   - token blast radius   → fine-grained PAT, Issues:write, single repo (README)
 *
 * Vars / secrets (wrangler.toml [vars] or `wrangler secret put`):
 *   GH_TOKEN          (secret) fine-grained PAT, Issues: read & write, this repo
 *   GH_REPO           "owner/repo" to file issues in (a PRIVATE triage repo is
 *                     safest — keeps spam/injected content out of public view)
 *   ALLOWED_ORIGIN    e.g. "https://wardcrazy01894.github.io" ("*" disables the
 *                     Origin check — dev only)
 *   TURNSTILE_SECRET  (secret, optional) enables Cloudflare Turnstile verification
 *   RL                (optional KV namespace binding) enables per-IP rate limiting
 */

const MAX_BODY_BYTES = 20_000
const MAX_MESSAGE = 2_000
const MAX_LOGS = 6_000
const RL_MAX_PER_HOUR = 5

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
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

/** Neutralize @mentions and code-fence breakout so report text can't ping users
 *  or inject Markdown outside its block. Uses a zero-width space. */
function defang(s) {
  return String(s)
    .replace(/```/g, '`​`​`')
    .replace(/@/g, '@​')
    .replace(/\r/g, '')
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
  } catch {
    return false
  }
}

export default {
  async fetch(request, env) {
    const headers = cors(env)
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
    const origin = request.headers.get('Origin')
    if (
      env.ALLOWED_ORIGIN &&
      env.ALLOWED_ORIGIN !== '*' &&
      origin &&
      origin !== env.ALLOWED_ORIGIN
    )
      return json({ error: 'forbidden origin' }, 403, headers)

    // Reject oversized bodies before parsing.
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
      if (n >= RL_MAX_PER_HOUR)
        return json({ error: 'rate limited, try later' }, 429, headers)
      await env.RL.put(key, String(n + 1), { expirationTtl: 3600 })
    }

    let body
    try {
      body = await request.json()
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
    const safeUrl =
      env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*'
        ? url.startsWith(env.ALLOWED_ORIGIN)
          ? url
          : '(omitted)'
        : defang(url)

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

    const res = await fetch(
      `https://api.github.com/repos/${env.GH_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'KnowYourLocals-bug-bot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: ['bug', 'from-app'],
        }),
      },
    )
    if (!res.ok)
      return json({ error: 'github error', status: res.status }, 502, headers)
    const issue = await res.json()
    return json({ ok: true, url: issue.html_url }, 200, headers)
  },
}
