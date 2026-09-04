import { describe, it, expect } from 'vitest'
import {
  normalizeBlurbResults,
  MAX_CHARS,
  ACCEPTED_CONFIDENCE,
} from './apply-blurbs-lib.mjs'

const row = (id, over = {}) => ({
  id,
  text: `About ${id}.`,
  sources: ['https://en.wikipedia.org/wiki/X'],
  confidence: 'high',
  note: '',
  ...over,
})
const known = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'])

describe('normalizeBlurbResults', () => {
  it('accepts a clean high/medium-confidence row with https sources', () => {
    const { accepted, skipped } = normalizeBlurbResults(
      [row('a'), row('b', { confidence: 'medium' })],
      { knownIds: known },
    )
    expect(accepted).toEqual([
      {
        id: 'a',
        text: 'About a.',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
      {
        id: 'b',
        text: 'About b.',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
    ])
    expect(Object.values(skipped).flat()).toEqual([])
    expect(ACCEPTED_CONFIDENCE.has('low')).toBe(false)
  })

  it('skips unknown ids, blank text, low confidence and over-long text — with reasons', () => {
    const { accepted, skipped } = normalizeBlurbResults(
      [
        row('zzz'),
        row('a', { text: '   ' }),
        row('b', { confidence: 'low' }),
        row('c', { text: 'x'.repeat(MAX_CHARS + 1) }),
      ],
      { knownIds: known },
    )
    expect(accepted).toEqual([])
    expect(skipped['unknown id']).toEqual(['zzz'])
    expect(skipped['blank text']).toEqual(['a'])
    expect(skipped['low confidence']).toEqual(['b'])
    expect(skipped['too long']).toEqual(['c'])
  })

  it('keeps only https sources (max 2, deduped) and skips a row left with none', () => {
    const { accepted, skipped } = normalizeBlurbResults(
      [
        row('a', {
          sources: [
            'http://plain.example',
            'https://one.example',
            'https://one.example',
            'https://two.example',
            'https://three.example',
          ],
        }),
        row('b', { sources: ['javascript:alert(1)'] }),
      ],
      { knownIds: known },
    )
    expect(accepted[0].sources).toEqual([
      'https://one.example',
      'https://two.example',
    ])
    expect(skipped['no https source']).toEqual(['b'])
  })

  it('never overwrites a hand-written entry unless --force', () => {
    const existing = { a: { text: 'hand-written' }, b: { text: '' } }
    const soft = normalizeBlurbResults([row('a'), row('b')], {
      knownIds: known,
      existing,
    })
    expect(soft.accepted.map((r) => r.id)).toEqual(['b'])
    expect(soft.skipped['already written (use --force)']).toEqual(['a'])
    const hard = normalizeBlurbResults([row('a')], {
      knownIds: known,
      existing,
      force: true,
    })
    expect(hard.accepted.map((r) => r.id)).toEqual(['a'])
  })

  it('collapses whitespace and takes the first row per id', () => {
    const { accepted } = normalizeBlurbResults(
      [row('a', { text: '  Two\n\n  lines.  ' }), row('a', { text: 'dupe' })],
      { knownIds: known },
    )
    expect(accepted).toEqual([
      {
        id: 'a',
        text: 'Two lines.',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
    ])
  })
})
