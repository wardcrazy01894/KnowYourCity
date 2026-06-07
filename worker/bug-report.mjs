/**
 * Cloudflare Worker: receive a bug report from the app and file a GitHub issue.
 *
 * Keeps the GitHub token server-side (never in the client bundle). Deploy with
 * Wrangler — see worker/README.md. The app points VITE_BUG_ENDPOINT at this
 * worker's URL.
 *
 * Secrets/vars (set via `wrangler secret put` / wrangler.toml [vars]):
 *   GH_TOKEN       — a fine-grained PAT with Issues: read & write on the repo
 *   GH_REPO        — "wardcrazy01894/KnowYourLocals"
 *   ALLOWED_ORIGIN — e.g. "https://wardcrazy01894.github.io" (or "*" for dev)
 */

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request, env) {
    const headers = cors(env)
    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'POST')
      return json({ error: 'method not allowed' }, 405, headers)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid json' }, 400, headers)
    }

    const message = String(body?.message ?? '')
      .slice(0, 2000)
      .trim()
    if (!message) return json({ error: 'empty message' }, 400, headers)

    const ctx = body?.context ?? {}
    const logs = String(body?.logs ?? '').slice(0, 6000)
    const title = '[bug] ' + (message.split('\n')[0] || '').slice(0, 80)
    const issueBody = [
      message,
      '',
      '---',
      `City: ${ctx.city ?? '?'}`,
      `Puzzle: ${ctx.date ?? '?'}`,
      `URL: ${ctx.url ?? ''}`,
      `Browser: ${ctx.userAgent ?? ''}`,
      '',
      '<details><summary>session logs</summary>',
      '',
      '```',
      logs || '(none)',
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
    if (!res.ok) {
      return json({ error: 'github error', status: res.status }, 502, headers)
    }
    const issue = await res.json()
    return json({ ok: true, url: issue.html_url }, 200, headers)
  },
}
