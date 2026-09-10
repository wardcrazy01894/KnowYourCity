import { describe, it, expect } from 'vitest'
import {
  normalizeBlurbResults,
  promotionalHits,
  isWritten,
  MAX_CHARS,
  MAX_DESCRIPTOR_CHARS,
  ACCEPTED_CONFIDENCE,
} from './apply-blurbs-lib.mjs'

const row = (id, over = {}) => ({
  id,
  text: `About ${id}.`,
  descriptor: '',
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
        descriptor: '',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
      {
        id: 'b',
        text: 'About b.',
        descriptor: '',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
    ])
    expect(Object.values(skipped).flat()).toEqual([])
    expect(ACCEPTED_CONFIDENCE.has('low')).toBe(false)
  })

  it('skips unknown ids, rows with nothing usable, and over-long text — with reasons', () => {
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
    expect(skipped['nothing usable (no text, no descriptor)']).toEqual([
      'a',
      'b',
    ])
    expect(skipped['too long']).toEqual(['c'])
  })

  it('keeps the descriptor when the story is blank or low-confidence (never a placeholder after research)', () => {
    const { accepted } = normalizeBlurbResults(
      [
        row('a', { text: '', descriptor: 'Neighborhood dive bar' }),
        row('b', { confidence: 'low', descriptor: '  Cuban  café  ' }),
      ],
      { knownIds: known },
    )
    expect(accepted).toEqual([
      {
        id: 'a',
        text: '',
        descriptor: 'Neighborhood dive bar',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
      // low-confidence STORY is dropped; the factual descriptor survives
      {
        id: 'b',
        text: '',
        descriptor: 'Cuban café',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
    ])
  })

  it('caps the descriptor length', () => {
    const { skipped } = normalizeBlurbResults(
      [
        row('a', {
          text: '',
          descriptor: 'd'.repeat(MAX_DESCRIPTOR_CHARS + 1),
        }),
      ],
      { knownIds: known },
    )
    expect(skipped['too long']).toEqual(['a'])
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

  it('a descriptor-only entry counts as written (never a research candidate, never overwritten)', () => {
    expect(isWritten({ text: '', descriptor: 'Neighborhood dive bar' })).toBe(
      true,
    )
    expect(isWritten({ text: 'story' })).toBe(true)
    expect(isWritten({ text: '  ', descriptor: ' ' })).toBe(false)
    expect(isWritten(undefined)).toBe(false)
    const existing = { a: { text: '', descriptor: 'Cuban café' } }
    const soft = normalizeBlurbResults([row('a')], {
      knownIds: known,
      existing,
    })
    expect(soft.accepted).toEqual([])
    expect(soft.skipped['already written (use --force)']).toEqual(['a'])
  })

  it('drops geocoder/search/map-data URLs from sources (not "read more" material)', () => {
    const { accepted } = normalizeBlurbResults(
      [
        row('a', {
          sources: [
            'https://nominatim.openstreetmap.org/reverse?lat=1&lon=2',
            'https://www.google.com/maps/place/x',
            'https://www.google.com/search?q=x',
            'https://duckduckgo.com/?q=x',
            'https://maps.google.com/?cid=123',
            // Google Maps short links and the search-redirect wrapper.
            'https://goo.gl/maps/abc123',
            'https://maps.app.goo.gl/abc123',
            'https://g.page/some-venue',
            'https://www.google.com/url?q=https://example.org',
            // Raw OSM database pages are map DATA, not reading — same class.
            'https://www.openstreetmap.org/node/2850801315',
            'https://openstreetmap.org/way/192516456',
            // Malformed doubled-domain URL (404s in practice).
            'https://www.openstreetmap.org/openstreetmap.org/node/13376921920',
            'https://ilovetheburg.com/some-story/',
          ],
        }),
      ],
      { knownIds: known },
    )
    expect(accepted[0].sources).toEqual([
      'https://ilovetheburg.com/some-story/',
    ])
  })

  it('keeps a real page that merely lives on a google.com subdomain', () => {
    // sites.google.com hosts genuine institutional pages (a university's
    // building-name histories, say). Only Maps and Search are map data and
    // result pages; the domain alone is not the signal.
    const { accepted } = normalizeBlurbResults(
      [
        row('a', {
          sources: [
            'https://sites.google.com/umich.edu/umnamestories/eula-d-marcks-garden',
          ],
        }),
      ],
      { knownIds: known },
    )
    expect(accepted[0].sources).toEqual([
      'https://sites.google.com/umich.edu/umnamestories/eula-d-marcks-garden',
    ])
  })

  it('a descriptor-only row may have no sources; a row with a story must have one', () => {
    const { accepted, skipped } = normalizeBlurbResults(
      [
        row('a', {
          text: '',
          descriptor: 'Seafood grill on Madonna Blvd',
          sources: [],
        }),
        row('b', {
          sources: ['https://nominatim.openstreetmap.org/reverse?x'],
        }),
      ],
      { knownIds: known },
    )
    expect(accepted).toEqual([
      {
        id: 'a',
        text: '',
        descriptor: 'Seafood grill on Madonna Blvd',
        sources: [],
      },
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
        descriptor: '',
        sources: ['https://en.wikipedia.org/wiki/X'],
      },
    ])
  })
})

describe('promotionalHits', () => {
  it('flags unsourced-superlative language in BOTH text and descriptor', () => {
    // Checking only `text` is how "award-winning" shipped twice: once in a
    // descriptor, once because the scan output went unread.
    const rows = [
      { id: 'a', text: 'An award-winning room.', descriptor: '' },
      {
        id: 'b',
        text: '',
        descriptor: 'Cafe known for award-winning chowders',
      },
      { id: 'c', text: 'A plain factual sentence.', descriptor: 'A cafe' },
    ]
    expect(promotionalHits(rows)).toEqual([
      { id: 'a', terms: ['award-winning'] },
      { id: 'b', terms: ['award-winning'] },
    ])
  })

  it('catches the whole vocabulary, case-insensitively', () => {
    const rows = [
      {
        id: 'a',
        text: 'A Hidden Gem and a must-see, world-class and renowned.',
        descriptor:
          'An award-winning, beloved, best-kept secret, nestled here.',
      },
    ]
    expect(promotionalHits(rows)[0].terms.sort()).toEqual([
      'award-winning',
      'beloved',
      'best-kept',
      'hidden gem',
      'must-see',
      'nestled',
      'renowned',
      'world-class',
    ])
  })

  it('catches hyphenated and spaced spellings alike', () => {
    // Three terms allowed [- ] but "hidden gem" did not, so "hidden-gem"
    // bypassed the check entirely — caught in review, not by the tests.
    const rows = [
      { id: 'a', text: 'A hidden-gem spot.' },
      { id: 'b', text: 'A best kept secret.' },
      { id: 'c', text: 'A must see, world class room.' },
    ]
    expect(promotionalHits(rows)).toEqual([
      { id: 'a', terms: ['hidden-gem'] },
      { id: 'b', terms: ['best kept'] },
      { id: 'c', terms: ['must see', 'world class'] },
    ])
  })

  it('returns nothing for clean rows', () => {
    expect(promotionalHits([{ id: 'a', text: 'Opened in 1954.' }])).toEqual([])
  })
})
