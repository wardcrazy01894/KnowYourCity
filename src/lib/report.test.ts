import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  addLocationRequestMessage,
  bugReportUrl,
  buildReportPayload,
  submitBugReport,
  REPO_URL,
} from './report'

describe('bugReportUrl', () => {
  it('points at the repo new-issue page', () => {
    expect(bugReportUrl()).toContain(`${REPO_URL}/issues/new`)
  })

  it('includes a title and body query params', () => {
    const u = new URL(bugReportUrl({ city: 'Seattle', date: '2026-06-06' }))
    expect(u.searchParams.get('title')).toContain('bug')
    const body = u.searchParams.get('body') || ''
    expect(body).toContain('Seattle')
    expect(body).toContain('2026-06-06')
  })

  it('is encoded (no spaces in the raw query string)', () => {
    expect(bugReportUrl({ city: 'St. Pete' })).not.toMatch(/ /)
  })

  it('includes the typed message in the body', () => {
    const u = new URL(bugReportUrl({}, 'map is blank'))
    expect(u.searchParams.get('body')).toContain('map is blank')
  })
})

describe('addLocationRequestMessage', () => {
  it('names the place and city when a name is given', () => {
    const m = addLocationRequestMessage('My Rich Uncle', 'St. Pete')
    expect(m).toContain('My Rich Uncle')
    expect(m).toContain('St. Pete')
    expect(m.toLowerCase()).toContain('add')
  })

  it('trims the place name', () => {
    expect(addLocationRequestMessage('  Kahuna’s  ', 'St. Pete')).toContain(
      '"Kahuna’s"',
    )
  })

  it('strips embedded double-quotes so the wrapping quotes never nest', () => {
    const m = addLocationRequestMessage('Joe\'s "Famous" Diner', 'St. Pete')
    expect(m).not.toContain('""')
    expect(m).toContain('"Joe\'s Famous Diner"')
  })

  it('falls back to a generic request when no name is given', () => {
    const m = addLocationRequestMessage('   ', 'St. Pete')
    expect(m.toLowerCase()).toContain('add')
    expect(m).toContain('St. Pete')
    expect(m).not.toContain('""')
  })
})

describe('submitBugReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('includes the server error status AND body when the endpoint rejects', async () => {
    vi.stubEnv('VITE_BUG_ENDPOINT', 'https://bug.example/report')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => '{"error":"rate limited, try later"}',
      })),
    )
    // The error a failed submit surfaces (and logs) must carry the reason, not
    // just "HTTP 429" — so a "couldn't report a bug" report is diagnosable.
    const err = await submitBugReport('hi').then(
      () => null,
      (e: unknown) => e,
    )
    expect(String(err)).toMatch(/429/)
    expect(String(err)).toMatch(/rate limited/)
  })
})

describe('buildReportPayload', () => {
  it('trims the message and carries context', () => {
    const p = buildReportPayload('  it broke  ', {
      city: 'Seattle',
      date: '2026-06-06',
    })
    expect(p.message).toBe('it broke')
    expect(p.context.city).toBe('Seattle')
    expect(p.context.date).toBe('2026-06-06')
    expect(typeof p.logs).toBe('string')
  })

  it('omits logs when includeLogs is false', () => {
    expect(buildReportPayload('x', {}, { includeLogs: false }).logs).toBe('')
  })

  it('carries the turnstile token when provided', () => {
    const p = buildReportPayload('x', {}, { turnstileToken: 'tok123' })
    expect(p.turnstileToken).toBe('tok123')
  })
})
