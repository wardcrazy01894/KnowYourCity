import { describe, it, expect } from 'vitest'
import { insertOverrideEntry, renderOverrideEntry } from './pin-day-lib.mjs'

/**
 * Owner rule (2026-07-08): once a day's lineup is set it must NEVER change —
 * a mid-day dataset edit (adding a venue) re-rolled the live St. Pete lineup
 * under players, because the PRNG selection is a function of the in-play pool.
 * `pin-day` freezes a city's current day as a DAILY_OVERRIDES entry BEFORE a
 * dataset edit lands. These tests pin the source-file insertion logic.
 */

const SOURCE = `/** header comment */
export const DAILY_OVERRIDES: Record<string, readonly string[]> = {}
`

const POPULATED = `/** header comment */
export const DAILY_OVERRIDES: Record<string, readonly string[]> = {
  // stpete — pinned 2026-07-08 (pin-day)
  'stpete:2026-07-08': [
    'vinoy-park',
    'la-v-vietnamese-fusion',
    'grove-surf-coffee',
    'the-bends',
    'round-lake',
  ],
}
`

describe('renderOverrideEntry', () => {
  it('renders a seed entry in the file’s existing style', () => {
    const out = renderOverrideEntry(
      'stpete:2026-07-08',
      ['a-1', 'b-2'],
      'pin-day',
    )
    expect(out).toContain(`'stpete:2026-07-08': [`)
    expect(out).toContain(`'a-1',`)
    expect(out).toContain(`'b-2',`)
    expect(out).toContain('pin-day')
  })
})

describe('insertOverrideEntry', () => {
  it('inserts into an EMPTY overrides object, producing valid entry syntax', () => {
    const out = insertOverrideEntry(SOURCE, 'stpete:2026-07-08', [
      'vinoy-park',
      'la-v-vietnamese-fusion',
      'grove-surf-coffee',
      'the-bends',
      'round-lake',
    ])
    expect(out).toContain(`'stpete:2026-07-08': [`)
    expect(out).toContain(`'round-lake',`)
    // Still one object literal, closed once.
    expect(out).toMatch(/= \{\n[\s\S]*\n\}\n$/)
  })

  it('appends before the closing brace of a populated object', () => {
    const out = insertOverrideEntry(POPULATED, 'seattle:2026-07-08', [
      'space-needle',
      'pike-place-market',
      'gas-works-park',
      'canlis',
      'paseo',
    ])
    // Existing entry intact, new one after it, single trailing close.
    expect(out.indexOf(`'stpete:2026-07-08'`)).toBeLessThan(
      out.indexOf(`'seattle:2026-07-08'`),
    )
    expect(out).toMatch(/\n\}\n$/)
    expect(out.match(/'seattle:2026-07-08'/g)).toHaveLength(1)
  })

  it('refuses to overwrite an existing seed (a set day never changes)', () => {
    expect(() =>
      insertOverrideEntry(POPULATED, 'stpete:2026-07-08', ['x-1']),
    ).toThrow(/already pinned/i)
  })
})
