import { describe, it, expect } from 'vitest'
import {
  addLocationRequestMessage,
  bugReportUrl,
  buildReportPayload,
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

  it('falls back to a generic request when no name is given', () => {
    const m = addLocationRequestMessage('   ', 'St. Pete')
    expect(m.toLowerCase()).toContain('add')
    expect(m).toContain('St. Pete')
    expect(m).not.toContain('""')
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
