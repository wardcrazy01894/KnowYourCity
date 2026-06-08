import { describe, it, expect } from 'vitest'
import {
  slug,
  cleanLocations,
  dedupeById,
  assignDifficulty,
  MEDIAN_FAME_FALLBACK,
} from './apply-difficulty-lib.mjs'

// Minimal location + fame-record builders (only the fields the pass reads).
const loc = (id, over = {}) => ({
  id,
  name: id,
  lat: 0,
  lng: 0,
  category: 'restaurant',
  clue: `clue for ${id}`,
  source: 'overpass',
  attribution: 't',
  ...over,
})
const fame = (id, over = {}) => ({
  id,
  status: 'open',
  currentName: '',
  fameScore: 50,
  reviewCount: 10,
  hasWikipedia: false,
  isNationalChain: false,
  statusNote: '',
  ...over,
})
const byId = (records) => new Map(records.map((r) => [r.id, r]))

describe('slug', () => {
  it('lowercases, strips punctuation/accents, hyphenates', () => {
    expect(slug('Café Soleil & Deli')).toBe('cafe-soleil-deli')
    expect(slug("Harry's  Beach   Bar")).toBe('harrys-beach-bar')
    expect(slug('--Edge--')).toBe('edge')
  })
})

describe('cleanLocations — status dispositions', () => {
  it('drops permanently-closed entries', () => {
    const { cleaned, audit } = cleanLocations(
      [loc('a')],
      byId([fame('a', { status: 'closed', statusNote: 'gone' })]),
    )
    expect(cleaned).toHaveLength(0)
    expect(audit.closed).toHaveLength(1)
  })

  it('drops national chains', () => {
    const { cleaned, audit } = cleanLocations(
      [loc('a')],
      byId([fame('a', { isNationalChain: true })]),
    )
    expect(cleaned).toHaveLength(0)
    expect(audit.chains).toHaveLength(1)
  })

  it("drops junk (status 'uncertain')", () => {
    const { cleaned, audit } = cleanLocations(
      [loc('a')],
      byId([fame('a', { status: 'uncertain' })]),
    )
    expect(cleaned).toHaveLength(0)
    expect(audit.junk).toHaveLength(1)
  })

  it('keeps a normal entry, carrying its fameScore as _fame', () => {
    const { cleaned } = cleanLocations(
      [loc('a')],
      byId([fame('a', { fameScore: 72 })]),
    )
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]._fame).toBe(72)
  })

  it('keeps a no-fame-record entry with the median fallback', () => {
    const { cleaned, audit } = cleanLocations([loc('a')], byId([]))
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]._fame).toBe(MEDIAN_FAME_FALLBACK)
    expect(audit.noFame).toHaveLength(1)
  })

  it('strips any prior difficulty so re-runs start clean', () => {
    const { cleaned } = cleanLocations(
      [loc('a', { difficulty: 'easy' })],
      byId([fame('a')]),
    )
    expect(cleaned[0]).not.toHaveProperty('difficulty')
  })
})

describe('cleanLocations — renames', () => {
  it('applies a rename: new slug id + name, clue nulled, kept', () => {
    const { cleaned, audit } = cleanLocations(
      [loc('old-id', { clue: 'old clue' })],
      byId([
        fame('old-id', { status: 'renamed', currentName: 'New Spot Café' }),
      ]),
    )
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0].id).toBe('new-spot-cafe')
    expect(cleaned[0].name).toBe('New Spot Café')
    expect(cleaned[0].clue).toBeNull()
    expect(audit.renamed).toHaveLength(1)
  })

  it('drops a rename whose new name reads as closed', () => {
    const { cleaned, audit } = cleanLocations(
      [loc('a')],
      byId([fame('a', { status: 'renamed', currentName: 'Now Closed' })]),
    )
    expect(cleaned).toHaveLength(0)
    expect(audit.renamedClosed).toHaveLength(1)
  })

  it('drops a rename with no replacement name', () => {
    const { cleaned, audit } = cleanLocations(
      [loc('a')],
      byId([fame('a', { status: 'renamed', currentName: '' })]),
    )
    expect(cleaned).toHaveLength(0)
    expect(audit.renamedClosed).toHaveLength(1)
  })
})

describe('dedupeById', () => {
  it('keeps the higher-fame entry when ids collide', () => {
    const { kept, deduped } = dedupeById([
      { id: 'x', name: 'low', _fame: 10 },
      { id: 'x', name: 'high', _fame: 90 },
      { id: 'y', name: 'solo', _fame: 50 },
    ])
    expect(kept).toHaveLength(2)
    const x = kept.find((k) => k.id === 'x')
    expect(x.name).toBe('high')
    expect(deduped).toHaveLength(1)
  })

  it('passes non-colliding entries through untouched', () => {
    const input = [
      { id: 'a', _fame: 1 },
      { id: 'b', _fame: 2 },
    ]
    const { kept, deduped } = dedupeById(input)
    expect(kept).toHaveLength(2)
    expect(deduped).toHaveLength(0)
  })
})

describe('assignDifficulty — narrow-easy bucketing', () => {
  // descending-fame helper: fame n, n-1, ... 1 so rank == array order
  const ranked = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `l${i}`, _fame: n - i }))

  it('splits 10 into 2 easy / 4 medium / 4 hard (round(2), round(3.5)=4)', () => {
    const kept = ranked(10)
    assignDifficulty(kept)
    const dist = kept.reduce(
      (m, l) => ((m[l.difficulty] = (m[l.difficulty] ?? 0) + 1), m),
      {},
    )
    expect(dist).toEqual({ easy: 2, medium: 4, hard: 4 })
  })

  it('assigns the highest fame easy and the lowest hard', () => {
    const kept = ranked(10)
    assignDifficulty(kept)
    const top = kept.find((l) => l._fame === 10)
    const bottom = kept.find((l) => l._fame === 1)
    expect(top.difficulty).toBe('easy')
    expect(bottom.difficulty).toBe('hard')
  })

  it('returns the easy/hard fame boundaries', () => {
    const kept = ranked(10)
    const { easyN, hardN, easyBound, hardBound } = assignDifficulty(kept)
    expect(easyN).toBe(2)
    expect(hardN).toBe(4)
    expect(easyBound).toBe(9) // 2nd-highest fame
    expect(hardBound).toBe(4) // first hard entry's fame
  })

  it('breaks fame ties by id so the ranking is deterministic', () => {
    const kept = [
      { id: 'zzz', _fame: 50 },
      { id: 'aaa', _fame: 50 },
    ]
    const { ranked: r } = assignDifficulty(kept)
    expect(r.map((l) => l.id)).toEqual(['aaa', 'zzz'])
  })

  it('respects custom percentile splits', () => {
    const kept = ranked(10)
    assignDifficulty(kept, 0.5, 0.5) // 5 easy / 5 hard / 0 medium
    const dist = kept.reduce(
      (m, l) => ((m[l.difficulty] = (m[l.difficulty] ?? 0) + 1), m),
      {},
    )
    expect(dist).toEqual({ easy: 5, hard: 5 })
  })
})
