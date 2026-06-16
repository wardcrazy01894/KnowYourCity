import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  slug,
  buildFameIndex,
  cleanLocations,
  dedupeById,
  dedupeByNameProximity,
  normalizeBusinessName,
  haversineMeters,
  byFameRank,
  assignDifficulty,
  assignCappedDifficulty,
  projectLocation,
  FIELD_ORDER,
  matchNationalChain,
  CAP_EASY_PCT,
  CAP_HARD_PCT,
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

describe('buildFameIndex', () => {
  it('indexes every record by its primary id', () => {
    const idx = buildFameIndex([fame('a'), fame('b')])
    expect(idx.get('a')?.id).toBe('a')
    expect(idx.get('b')?.id).toBe('b')
  })

  it('also aliases a renamed record by slug(currentName) so re-runs find it', () => {
    // A renamed record is keyed by its OLD id; on a re-run the dataset row
    // already carries the NEW id, so we must also resolve it by the new slug.
    const idx = buildFameIndex([
      fame('old-id', { status: 'renamed', currentName: 'New Spot Café' }),
    ])
    expect(idx.get('old-id')?.id).toBe('old-id') // primary still works
    expect(idx.get('new-spot-cafe')?.id).toBe('old-id') // alias resolves
  })

  it('never lets a rename alias clobber a real primary id', () => {
    // record B's real id collides with A's rename target -> B must win.
    const a = fame('a', { status: 'renamed', currentName: 'B' })
    const b = fame('b', { fameScore: 99 })
    const idx = buildFameIndex([a, b])
    expect(idx.get('b')).toBe(b) // real record, not the alias
  })

  it('makes the rename pass idempotent: re-running keeps fame, not the fallback', () => {
    // Regression for the 26-orphaned-renames bug: first run renamed
    // old-id -> new-spot-cafe; a second run sees the new id and must still
    // find fameScore 81 via the alias rather than dropping to the median.
    const results = [
      fame('old-id', {
        status: 'renamed',
        currentName: 'New Spot Café',
        fameScore: 81,
      }),
    ]
    const idx = buildFameIndex(results)
    const alreadyRenamed = loc('new-spot-cafe', { name: 'New Spot Café' })
    const { cleaned, audit } = cleanLocations([alreadyRenamed], idx)
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]._fame).toBe(81)
    expect(audit.noFame).toHaveLength(0)
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

  it('keeps a normal entry, carrying its fameScore as _fame and reviewCount as _reviewCount', () => {
    const { cleaned } = cleanLocations(
      [loc('a')],
      byId([fame('a', { fameScore: 72, reviewCount: 321 })]),
    )
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]._fame).toBe(72)
    expect(cleaned[0]._reviewCount).toBe(321)
  })

  it('uses _reviewCount 0 for a no-fame-record row', () => {
    const { cleaned } = cleanLocations([loc('a')], byId([]))
    expect(cleaned[0]._reviewCount).toBe(0)
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

describe('normalizeBusinessName', () => {
  it('lowercases, expands &, strips punctuation/accents', () => {
    expect(normalizeBusinessName('Spud Fish & Chips')).toBe(
      'spud fish and chips',
    )
    expect(normalizeBusinessName("Westman's Bagel & Coffee")).toBe(
      'westmans bagel and coffee',
    )
    expect(normalizeBusinessName('Café Soleil')).toBe('cafe soleil')
  })

  it('strips a TRAILING city token but not a leading/internal one', () => {
    expect(normalizeBusinessName('Moore Coffee Seattle', ['seattle'])).toBe(
      'moore coffee',
    )
    // "Seattle" as a prefix is part of the real name — keep it.
    expect(normalizeBusinessName('Seattle Coffee Works', ['seattle'])).toBe(
      'seattle coffee works',
    )
  })
})

describe('haversineMeters', () => {
  it('is ~0 for identical points and ~99m for the Moore Coffee pair', () => {
    expect(
      haversineMeters({ lat: 47.6, lng: -122.3 }, { lat: 47.6, lng: -122.3 }),
    ).toBeCloseTo(0, 5)
    const d = haversineMeters(
      { lat: 47.611635, lng: -122.341267 },
      { lat: 47.610772, lng: -122.340957 },
    )
    expect(d).toBeGreaterThan(80)
    expect(d).toBeLessThan(120)
  })
})

describe('dedupeByNameProximity', () => {
  const place = (id, name, lat, lng, _fame) => ({ id, name, lat, lng, _fame })

  it('collapses a same-name pair within maxMeters, keeping higher fame', () => {
    const { kept, merged } = dedupeByNameProximity(
      [
        place('moore-coffee', 'Moore Coffee', 47.611635, -122.341267, 48),
        place(
          'moore-coffee-seattle',
          'Moore Coffee Seattle',
          47.610772,
          -122.340957,
          40,
        ),
        place('solo', 'Solo Cafe', 47.7, -122.4, 30),
      ],
      { cityTokens: ['seattle'] },
    )
    expect(kept.map((k) => k.id).sort()).toEqual(['moore-coffee', 'solo'])
    expect(merged).toHaveLength(1)
  })

  it('breaks fame ties deterministically by id (keeps the smaller id)', () => {
    const { kept } = dedupeByNameProximity(
      [
        place(
          'moore-coffee-seattle',
          'Moore Coffee Seattle',
          47.610772,
          -122.340957,
          48,
        ),
        place('moore-coffee', 'Moore Coffee', 47.611635, -122.341267, 48),
      ],
      { cityTokens: ['seattle'] },
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].id).toBe('moore-coffee')
  })

  it('KEEPS same-name entries that are far apart (genuine multi-location)', () => {
    const { kept, merged } = dedupeByNameProximity([
      place('spud-a', 'Spud Fish and Chips', 47.579549, -122.408799, 70),
      place('spud-b', 'Spud Fish & Chips', 47.678352, -122.326923, 70),
    ])
    expect(kept).toHaveLength(2)
    expect(merged).toHaveLength(0)
  })

  it('passes singletons through and preserves input order of survivors', () => {
    const input = [place('a', 'Alpha', 0, 0, 1), place('b', 'Beta', 1, 1, 2)]
    const { kept, merged } = dedupeByNameProximity(input)
    expect(kept.map((k) => k.id)).toEqual(['a', 'b'])
    expect(merged).toHaveLength(0)
  })

  it('merges a TRANSITIVE same-name chain into one (union-find), not the ends apart', () => {
    // A~B (~133 m) and B~C (~133 m) are each within range but A~C (~266 m) is
    // NOT. Greedy clustering would keep A and C as two reps; transitive
    // (union-find) clustering collapses all three into the best-ranked one.
    const { kept, merged } = dedupeByNameProximity([
      place('chain-a', 'Chain Cafe', 0, 0, 90),
      place('chain-b', 'Chain Cafe', 0.0012, 0, 80),
      place('chain-c', 'Chain Cafe', 0.0024, 0, 70),
    ])
    expect(kept.map((k) => k.id)).toEqual(['chain-a'])
    expect(merged).toHaveLength(2)
  })
})

describe('byFameRank', () => {
  it('orders by fame desc, then reviewCount desc, then id asc', () => {
    const rows = [
      { id: 'b', _fame: 50, _reviewCount: 10 },
      { id: 'a', _fame: 50, _reviewCount: 10 },
      { id: 'c', _fame: 50, _reviewCount: 999 },
      { id: 'd', _fame: 90, _reviewCount: 0 },
    ]
    expect([...rows].sort(byFameRank).map((r) => r.id)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ])
  })

  it('treats a missing reviewCount as 0', () => {
    const rows = [
      { id: 'x', _fame: 40 },
      { id: 'y', _fame: 40, _reviewCount: 5 },
    ]
    expect([...rows].sort(byFameRank).map((r) => r.id)).toEqual(['y', 'x'])
  })
})

describe('assignCappedDifficulty — reviewCount tie-break at the cap cut', () => {
  it('keeps the higher-review-count rows in play among fame ties', () => {
    const rows = [
      { id: 'low1', _fame: 44, _reviewCount: 5 },
      { id: 'high', _fame: 44, _reviewCount: 900 },
      { id: 'low2', _fame: 44, _reviewCount: 5 },
      { id: 'mid', _fame: 44, _reviewCount: 100 },
    ]
    assignCappedDifficulty(rows, 2)
    const inPlay = rows
      .filter((r) => r.inPlay)
      .map((r) => r.id)
      .sort()
    expect(inPlay).toEqual(['high', 'mid'])
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

describe('assignCappedDifficulty — play-set cap + count buckets', () => {
  const ranked = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      category: 'restaurant',
      _fame: n - i, // l0 highest fame, l{n-1} lowest
    }))
  const dist = (rows) =>
    rows.reduce(
      (m, l) => (
        (m[l.difficulty ?? '(none)'] = (m[l.difficulty ?? '(none)'] ?? 0) + 1),
        m
      ),
      {},
    )

  it('keeps only the top-`cap` by fame in play, benches the rest', () => {
    const kept = ranked(20)
    assignCappedDifficulty(kept, 5)
    const inPlay = kept.filter((l) => l.inPlay)
    const benched = kept.filter((l) => l.inPlay === false)
    expect(inPlay).toHaveLength(5)
    expect(benched).toHaveLength(15)
    // the 5 highest-fame are the in-play ones
    expect(inPlay.map((l) => l._fame).sort((a, b) => b - a)).toEqual([
      20, 19, 18, 17, 16,
    ])
  })

  it('buckets the play set by count: top 40% easy / last 20% hard / rest medium', () => {
    const kept = ranked(20)
    assignCappedDifficulty(kept, 10) // play 10 -> easy 4, hard 2, medium 4
    expect(dist(kept.filter((l) => l.inPlay))).toEqual({
      easy: 4,
      medium: 4,
      hard: 2,
    })
  })

  it('matches the 500/200-cap intent (200 easy / 200 medium / 100 hard at 500)', () => {
    const kept = ranked(800)
    const { easyN, hardN, playN } = assignCappedDifficulty(kept, 500)
    expect(playN).toBe(500)
    expect(easyN).toBe(200)
    expect(hardN).toBe(100)
    expect(dist(kept.filter((l) => l.inPlay))).toEqual({
      easy: 200,
      medium: 200,
      hard: 100,
    })
  })

  it('benched rows have NO difficulty (only a fame score is kept on the row)', () => {
    const kept = ranked(8)
    assignCappedDifficulty(kept, 3)
    for (const l of kept.filter((x) => x.inPlay === false)) {
      expect(l.difficulty).toBeUndefined()
    }
  })

  it('when cap >= available, everything is in play and nothing benched', () => {
    const kept = ranked(4)
    const { playN } = assignCappedDifficulty(kept, 10)
    expect(playN).toBe(4)
    expect(kept.every((l) => l.inPlay === true)).toBe(true)
    expect(kept.some((l) => l.inPlay === false)).toBe(false)
  })

  it('exposes the 40/20 cap split constants', () => {
    expect(CAP_EASY_PCT).toBe(0.4)
    expect(CAP_HARD_PCT).toBe(0.2)
  })
})

describe('projectLocation (dataset field projection)', () => {
  it('preserves the polygon field for large-footprint locations', () => {
    // Regression: polygon was added in #97 but omitted from FIELD_ORDER, so
    // re-running the pass (for a closure or re-cap) silently stripped it.
    const polygon = [
      [27.7, -82.6],
      [27.8, -82.6],
      [27.8, -82.5],
    ]
    const out = projectLocation({
      id: 'a',
      name: 'A',
      lat: 27.7,
      lng: -82.6,
      category: 'park',
      difficulty: 'easy',
      inPlay: true,
      fameScore: 80,
      clue: null,
      photoUrl: null,
      source: 'overpass',
      attribution: 't',
      polygon,
      _fame: 80,
    })
    expect(out.polygon).toEqual(polygon)
  })

  it('drops internal _fame and omits absent optional fields', () => {
    const out = projectLocation({
      id: 'a',
      name: 'A',
      lat: 0,
      lng: 0,
      category: 'restaurant',
      source: 'overpass',
      attribution: 't',
      _fame: 50,
    })
    expect('_fame' in out).toBe(false)
    expect('polygon' in out).toBe(false)
    expect('inPlay' in out).toBe(false)
  })

  it('emits fields in canonical order with polygon last', () => {
    expect(FIELD_ORDER[0]).toBe('id')
    expect(FIELD_ORDER[FIELD_ORDER.length - 1]).toBe('polygon')
    const out = projectLocation({
      id: 'a',
      polygon: [[0, 0]],
      name: 'A',
      attribution: 't',
    })
    expect(Object.keys(out)).toEqual(['id', 'name', 'attribution', 'polygon'])
  })
})

describe('matchNationalChain', () => {
  const CHAINS = ['bjs', 'chilis', 'churchs chicken', 'olive garden', 'sonic']

  it('matches a bare chain name (apostrophe-insensitive)', () => {
    expect(matchNationalChain("BJ's", CHAINS)).toBe('bjs')
    expect(matchNationalChain("Chili's", CHAINS)).toBe('chilis')
  })

  it('matches when the chain token is part of a longer venue name', () => {
    expect(matchNationalChain("BJ's Restaurant & Brewhouse", CHAINS)).toBe(
      'bjs',
    )
    expect(matchNationalChain("Church's Chicken", CHAINS)).toBe(
      'churchs chicken',
    )
    expect(matchNationalChain('Olive Garden Italian Restaurant', CHAINS)).toBe(
      'olive garden',
    )
  })

  it('respects word boundaries (no substring false positives)', () => {
    expect(matchNationalChain('Subjective Coffee', CHAINS)).toBeNull() // not "bjs"
    expect(matchNationalChain('Sonic Boom Records', CHAINS)).toBe('sonic') // word match still fires
    expect(matchNationalChain('Supersonic Cafe', CHAINS)).toBeNull() // "sonic" inside a word
  })

  it('returns null for local / FL-regional names not on the list', () => {
    expect(matchNationalChain('Burger Monger', CHAINS)).toBeNull()
    expect(matchNationalChain("Beef 'O' Brady's", CHAINS)).toBeNull()
    expect(matchNationalChain('Sunken Gardens', CHAINS)).toBeNull()
  })
})

describe('cleanLocations — national-chain list', () => {
  const baseLoc = (id, name) => ({
    id,
    name,
    lat: 0,
    lng: 0,
    category: 'restaurant',
    source: 'overpass',
    attribution: 't',
  })
  const fameOpen = (id) => ({
    id,
    status: 'open',
    currentName: '',
    fameScore: 40,
    reviewCount: 10,
    hasWikipedia: false,
  })

  it('drops an in-play venue whose name matches the chain list', () => {
    const orig = [baseLoc('chilis', "Chili's"), baseLoc('local', 'Local Spot')]
    const fameById = buildFameIndex([fameOpen('chilis'), fameOpen('local')])
    const { cleaned, audit } = cleanLocations(orig, fameById, 50, {
      chains: ['chilis'],
    })
    expect(cleaned.map((l) => l.id)).toEqual(['local'])
    expect(audit.chains.some((c) => c.includes('chilis'))).toBe(true)
  })

  it('keeps a chain-name match when its id is in keepIds (local namesake)', () => {
    const orig = [baseLoc('sonic-local', 'Sonic Boom Records')]
    const fameById = buildFameIndex([fameOpen('sonic-local')])
    const { cleaned } = cleanLocations(orig, fameById, 50, {
      chains: ['sonic'],
      keepIds: { 'sonic-local': 'local record store, not the drive-in' },
    })
    expect(cleaned.map((l) => l.id)).toEqual(['sonic-local'])
  })
})

describe('national-chain guard — no chain leaks in-play in any committed dataset', () => {
  const { readFileSync, readdirSync } = fs
  const cfg = JSON.parse(
    readFileSync(new URL('../data/national-chains.json', import.meta.url)),
  )
  const cities = readdirSync(new URL('../public/', import.meta.url))
    .filter((f) => /^locations\..+\.json$/.test(f))
    .map((f) => f.match(/^locations\.(.+)\.json$/)[1])

  it.each(cities)('%s has no national-chain name in the play set', (city) => {
    const locs = JSON.parse(
      readFileSync(
        new URL(`../public/locations.${city}.json`, import.meta.url),
      ),
    ).locations
    const leaked = locs
      .filter((l) => l.inPlay !== false)
      .filter((l) => !cfg.keepIds[l.id])
      .map((l) => ({
        id: l.id,
        name: l.name,
        chain: matchNationalChain(l.name, cfg.chains),
      }))
      .filter((x) => x.chain)
    // If this fails: either add the chain token's victim to data/national-chains.json
    // keepIds (a local namesake) or it's a real chain — mark it isNationalChain.
    expect(leaked).toEqual([])
  })
})
