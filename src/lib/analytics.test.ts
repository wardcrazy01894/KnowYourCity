import { describe, it, expect } from 'vitest'
import { cfBeaconAttrs } from './analytics'

describe('cfBeaconAttrs', () => {
  it('returns null when no token is configured', () => {
    expect(cfBeaconAttrs(undefined)).toBeNull()
    expect(cfBeaconAttrs('')).toBeNull()
    expect(cfBeaconAttrs('   ')).toBeNull()
  })

  it('builds the beacon script attributes for a token', () => {
    const attrs = cfBeaconAttrs('abc123')
    expect(attrs).toEqual({
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
      'data-cf-beacon': '{"token":"abc123"}',
    })
  })

  it('trims surrounding whitespace from the token', () => {
    expect(cfBeaconAttrs(' abc123 ')?.['data-cf-beacon']).toBe(
      '{"token":"abc123"}',
    )
  })

  it('JSON-encodes the token so quotes cannot break the attribute', () => {
    const attrs = cfBeaconAttrs('a"b')
    expect(JSON.parse(attrs!['data-cf-beacon'])).toEqual({ token: 'a"b' })
  })
})
