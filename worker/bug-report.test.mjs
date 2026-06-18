import { describe, it, expect } from 'vitest'
import { defang, allowedOrigins, originAllowed, cors } from './bug-report.mjs'

/**
 * The bug-report Worker is a public, unauthenticated endpoint. Its abuse
 * mitigations are pure functions — exercise them directly so a regression
 * (reflecting a hostile origin, leaking an @mention, breaking the code fence)
 * can't ship silently. The fetch handler itself is integration-tested manually
 * against a deployed worker (see worker/README.md).
 */

describe('defang', () => {
  it('breaks up code fences so report text can’t escape its block', () => {
    const out = defang('```js\nalert(1)\n```')
    expect(out).not.toContain('```')
  })

  it('neutralizes @mentions so a report can’t ping GitHub users', () => {
    const out = defang('cc @maintainer @everyone')
    expect(out).not.toMatch(/(^|[^​])@[a-z]/i)
    expect(out).toContain('@​')
  })

  it('strips carriage returns', () => {
    expect(defang('a\r\nb')).toBe('a\nb')
  })

  it('neutralizes inline markdown links (no disguised phishing link in a public issue)', () => {
    const out = defang('[click here](https://evil.example/phish)')
    // The link syntax `](` is broken so GitHub renders it as plain text…
    expect(out).not.toMatch(/\]\(/)
    // …but the text is preserved so a triager still sees what was reported.
    expect(out).toContain('click here')
    expect(out).toContain('evil.example')
  })

  it('neutralizes markdown images (no auto-loading tracking-beacon)', () => {
    const out = defang('![x](https://evil.example/track.png)')
    // Both the image marker `![` and the target `](` are broken.
    expect(out).not.toMatch(/!\[/)
    expect(out).not.toMatch(/\]\(/)
  })

  it('also defuses reference-style image markers', () => {
    expect(defang('![beacon][1]')).not.toMatch(/!\[/)
  })

  it('coerces non-strings without throwing', () => {
    expect(() => defang(null)).not.toThrow()
    expect(defang(undefined)).toBe('undefined')
  })
})

describe('allowedOrigins', () => {
  it('splits a comma list and trims whitespace', () => {
    expect(
      allowedOrigins({ ALLOWED_ORIGIN: 'https://a.com, https://b.com' }),
    ).toEqual(['https://a.com', 'https://b.com'])
  })

  it('defaults to wildcard when unset', () => {
    expect(allowedOrigins({})).toEqual(['*'])
  })

  it('drops empty entries', () => {
    expect(allowedOrigins({ ALLOWED_ORIGIN: 'https://a.com,, ' })).toEqual([
      'https://a.com',
    ])
  })
})

describe('originAllowed', () => {
  const env = { ALLOWED_ORIGIN: 'https://a.com,https://b.com' }

  it('allows a listed origin', () => {
    expect(originAllowed(env, 'https://a.com')).toBe(true)
  })

  it('rejects an unlisted origin (XSS-pivot defense)', () => {
    expect(originAllowed(env, 'https://evil.com')).toBe(false)
  })

  it('rejects a null/empty origin when not wildcard', () => {
    // Returns a falsy value (null/'' via short-circuit), never a listed match.
    expect(originAllowed(env, null)).toBeFalsy()
    expect(originAllowed(env, '')).toBeFalsy()
  })

  it('allows anything when configured as wildcard (dev)', () => {
    expect(originAllowed({ ALLOWED_ORIGIN: '*' }, 'https://anything.dev')).toBe(
      true,
    )
  })
})

describe('cors', () => {
  it('reflects the request origin when it is allowed', () => {
    const h = cors(
      { ALLOWED_ORIGIN: 'https://a.com,https://b.com' },
      'https://b.com',
    )
    expect(h['Access-Control-Allow-Origin']).toBe('https://b.com')
    expect(h['Vary']).toBe('Origin')
  })

  it('does NOT reflect a disallowed origin — falls back to the first configured one', () => {
    const h = cors({ ALLOWED_ORIGIN: 'https://a.com' }, 'https://evil.com')
    expect(h['Access-Control-Allow-Origin']).toBe('https://a.com')
    expect(h['Access-Control-Allow-Origin']).not.toBe('https://evil.com')
  })

  it('returns wildcard when configured wildcard', () => {
    const h = cors({ ALLOWED_ORIGIN: '*' }, 'https://x.dev')
    expect(h['Access-Control-Allow-Origin']).toBe('*')
  })
})
