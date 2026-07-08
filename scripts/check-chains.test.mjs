import { describe, it, expect } from 'vitest'
import { chainCandidates } from './check-chains-lib.mjs'

/**
 * Orchestration pin for check-chains (scan M6): the CLI's scan logic — which
 * in-play rows get flagged for review — previously lived only in the untested
 * script body. matchNationalChain itself is covered in apply-difficulty tests;
 * this pins the filter/exclusion wiring around it.
 */

const cfg = {
  chains: ['mcdonalds', 'kekes'],
  keepIds: { 'chilis-south-indian-cuisine': 'local namesake' },
}

const loc = (id, name, inPlay = true) => ({ id, name, inPlay })

describe('chainCandidates', () => {
  it('flags an in-play row whose name matches the chain list', () => {
    const hits = chainCandidates(
      [loc('mcdonalds-4th-st', "McDonald's 4th St")],
      cfg,
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].chain).toBe('mcdonalds')
    expect(hits[0].l.id).toBe('mcdonalds-4th-st')
  })

  it('ignores benched rows — only the play set matters', () => {
    expect(
      chainCandidates([loc('mcdonalds-x', "McDonald's", false)], cfg),
    ).toHaveLength(0)
  })

  it('excludes verified local namesakes via keepIds', () => {
    expect(
      chainCandidates(
        [loc('chilis-south-indian-cuisine', "Chili's South Indian Cuisine")],
        { ...cfg, chains: ['chilis'] },
      ),
    ).toHaveLength(0)
  })

  it('passes clean local venues through untouched', () => {
    expect(
      chainCandidates([loc('the-horse-jockey', 'The Horse & Jockey')], cfg),
    ).toHaveLength(0)
  })
})
