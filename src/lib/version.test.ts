import { describe, expect, it } from 'vitest'
import { versionCheckAction } from './version'

describe('versionCheckAction', () => {
  it('returns noop when hashes match, regardless of city state', () => {
    expect(versionCheckAction('abc123', 'abc123', false)).toBe('noop')
    expect(versionCheckAction('abc123', 'abc123', true)).toBe('noop')
  })

  it('returns reload when hashes differ and no city is chosen', () => {
    expect(versionCheckAction('abc123', 'def456', false)).toBe('reload')
  })

  it('returns banner when hashes differ and a city has been chosen', () => {
    expect(versionCheckAction('abc123', 'def456', true)).toBe('banner')
  })

  it('treats "dev" fallback hash the same as any other value', () => {
    // In dev the hash is 'dev'; if somehow version.json also said 'dev' it
    // would be a noop, which is the correct behaviour.
    expect(versionCheckAction('dev', 'dev', false)).toBe('noop')
    expect(versionCheckAction('dev', 'abc123', false)).toBe('reload')
  })
})
