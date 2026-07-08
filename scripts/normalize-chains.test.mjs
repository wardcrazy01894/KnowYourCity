import { describe, it, expect } from 'vitest'
import { disambiguateCollision } from './normalize-chains.mjs'

/**
 * Orchestration pin for normalize-chains (scan M6): the within-brand collision
 * policy — two branches labeled into the same neighborhood — previously lived
 * only in the untested script body.
 */

describe('disambiguateCollision', () => {
  it('appends the reverse-geocoded street when it adds information', () => {
    expect(
      disambiguateCollision('Bandit Coffee - Grand Central', '1st Ave S', 2),
    ).toBe('Bandit Coffee - Grand Central (1st Ave S)')
  })

  it('falls back to a counter when the street is already in the name', () => {
    expect(
      disambiguateCollision('Bandit Coffee - Central Ave', 'Central Ave', 3),
    ).toBe('Bandit Coffee - Central Ave #3')
  })

  it('falls back to a counter when there is no street at all', () => {
    expect(disambiguateCollision('Bandit Coffee - Downtown', null, 2)).toBe(
      'Bandit Coffee - Downtown #2',
    )
  })
})
