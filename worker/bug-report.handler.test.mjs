import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from './bug-report.mjs'

/**
 * Handler-level tests for the bug-report Worker's `fetch`. The pure helpers are
 * covered in bug-report.test.mjs; here we drive the whole request path with a
 * mocked `env` and a mocked global `fetch` (Turnstile siteverify + GitHub API),
 * so the abuse-control branches (fail-closed, origin allowlist, rate limit,
 * size cap, Turnstile, phishing-URL scrub) can't regress silently.
 */

const ORIGIN = 'https://wardcrazy01894.github.io'

// A KV stub for the per-IP rate limiter (env.RL). count = current counter value.
const kv = (count = 0) => ({
  get: vi.fn(async () => (count ? String(count) : null)),
  put: vi.fn(async () => {}),
})

const makeEnv = (over = {}) => ({
  ALLOWED_ORIGIN: ORIGIN,
  GH_REPO: 'owner/repo',
  GH_TOKEN: 'gh-secret',
  RL: kv(0), // an anti-abuse control is present -> not fail-closed
  ...over,
})

const post = (body, { origin = ORIGIN, headers = {} } = {}) =>
  new Request('https://worker.example/', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

let githubCall

beforeEach(() => {
  githubCall = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('siteverify')) {
        return { json: async () => ({ success: globalThis.__turnstileOk }) }
      }
      if (u.includes('api.github.com')) {
        githubCall = { url: u, init, body: JSON.parse(init.body) }
        return globalThis.__githubOk === false
          ? { ok: false, status: 422, json: async () => ({}) }
          : {
              ok: true,
              status: 201,
              json: async () => ({
                html_url: 'https://github.com/owner/repo/issues/1',
              }),
            }
      }
      throw new Error('unexpected fetch ' + u)
    }),
  )
  globalThis.__turnstileOk = true
  globalThis.__githubOk = true
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete globalThis.__turnstileOk
  delete globalThis.__githubOk
})

describe('bug-report worker handler', () => {
  it('answers CORS preflight (OPTIONS) with the allowed-origin headers', async () => {
    const res = await handler.fetch(
      new Request('https://worker.example/', {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      }),
      makeEnv(),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('rejects non-POST methods with 405', async () => {
    const res = await handler.fetch(
      new Request('https://worker.example/', {
        method: 'GET',
        headers: { Origin: ORIGIN },
      }),
      makeEnv(),
    )
    expect(res.status).toBe(405)
  })

  it('fails CLOSED (503) when no rate-limit or Turnstile is configured', async () => {
    const env = makeEnv({ RL: undefined })
    const res = await handler.fetch(post({ message: 'hi' }), env)
    expect(res.status).toBe(503)
  })

  it('rejects a disallowed Origin with 403 (server-side allowlist)', async () => {
    const res = await handler.fetch(
      post({ message: 'hi' }, { origin: 'https://evil.example' }),
      makeEnv(),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/forbidden origin/)
  })

  it('rejects an oversized body (413) before parsing', async () => {
    const res = await handler.fetch(
      post({ message: 'hi' }, { headers: { 'Content-Length': '999999' } }),
      makeEnv(),
    )
    expect(res.status).toBe(413)
  })

  it('rate-limits per IP (429) once the KV counter is at the cap', async () => {
    const res = await handler.fetch(
      post({ message: 'hi' }),
      makeEnv({ RL: kv(5) }),
    )
    expect(res.status).toBe(429)
  })

  it('rejects invalid JSON with 400', async () => {
    const res = await handler.fetch(post('{ not json', {}), makeEnv())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/invalid json/)
  })

  it('rejects a failed Turnstile check with 403', async () => {
    globalThis.__turnstileOk = false
    const res = await handler.fetch(
      post({ message: 'hi', turnstileToken: 'tok' }),
      makeEnv({ TURNSTILE_SECRET: 'secret' }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/verification failed/)
  })

  it('rejects an empty message with 400', async () => {
    const res = await handler.fetch(post({ message: '   ' }), makeEnv())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/empty message/)
  })

  it('files a GitHub issue and returns 200 + url on the happy path', async () => {
    const res = await handler.fetch(
      post({ message: 'the map was grey', context: { city: 'seattle' } }),
      makeEnv(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      url: 'https://github.com/owner/repo/issues/1',
    })
    expect(githubCall.url).toContain('/repos/owner/repo/issues')
    expect(githubCall.body.labels).toContain('bug')
  })

  it('surfaces a GitHub API failure as 502', async () => {
    globalThis.__githubOk = false
    const res = await handler.fetch(post({ message: 'hi' }), makeEnv())
    expect(res.status).toBe(502)
  })

  it('omits a phishing URL not from our origin from the issue body', async () => {
    await handler.fetch(
      post({ message: 'hi', context: { url: 'https://evil.example/steal' } }),
      makeEnv(),
    )
    expect(githubCall.body.body).toContain('URL: (omitted)')
    expect(githubCall.body.body).not.toContain('evil.example')
  })

  it('keeps a same-origin reported URL in the issue body', async () => {
    await handler.fetch(
      post({ message: 'hi', context: { url: ORIGIN + '/KnowYourLocals/' } }),
      makeEnv(),
    )
    expect(githubCall.body.body).toContain(`URL: ${ORIGIN}/KnowYourLocals/`)
  })
})
