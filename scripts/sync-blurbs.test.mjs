import { describe, it, expect } from 'vitest'
import {
  snapshotFor,
  staleReason,
  syncBlurbs,
  STALE_MOVE_METERS,
} from './sync-blurbs-lib.mjs'

const loc = (id, over = {}) => ({
  id,
  name: id,
  lat: 27.77,
  lng: -82.63,
  category: 'restaurant',
  ...over,
})

const entry = (loc, over = {}) => ({
  text: `about ${loc.id}`,
  sources: ['https://example.org'],
  writtenFor: snapshotFor(loc),
  writtenOn: '2026-09-04',
  ...over,
})

describe('snapshotFor', () => {
  it('captures the identity a blurb was written against (name + coords)', () => {
    expect(snapshotFor(loc('a', { name: 'A Place', lat: 1.23456789 }))).toEqual(
      {
        name: 'A Place',
        lat: 1.23457,
        lng: -82.63,
      },
    )
  })
})

describe('staleReason', () => {
  it('is null when the location still matches the snapshot', () => {
    const l = loc('a', { name: 'A' })
    expect(staleReason(entry(l), l)).toBeNull()
  })

  it('flags a display-name change', () => {
    const l = loc('a', { name: 'Old Name' })
    const e = entry(l)
    expect(staleReason(e, { ...l, name: 'New Name' })).toMatch(
      /name changed.*Old Name.*New Name/,
    )
  })

  it('flags a move beyond the tolerance, but not a small re-pin', () => {
    const l = loc('a')
    const e = entry(l)
    // ~50 m north: a precision re-pin, same venue.
    expect(staleReason(e, { ...l, lat: l.lat + 0.00045 })).toBeNull()
    // ~1.1 km north: the venue relocated (or the pin was wrong all along).
    expect(staleReason(e, { ...l, lat: l.lat + 0.01 })).toMatch(/moved/)
    expect(STALE_MOVE_METERS).toBeGreaterThan(50)
  })

  it('flags an entry with no snapshot at all', () => {
    expect(staleReason({ text: 'x' }, loc('a'))).toMatch(/no writtenFor/)
  })
})

describe('syncBlurbs', () => {
  const file = (blurbs, retired = {}) => ({
    version: 1,
    city: 'stpete',
    blurbs,
    retired,
  })

  it('leaves matching entries untouched', () => {
    const a = loc('a')
    const out = syncBlurbs(file({ a: entry(a) }), [a], { today: '2026-09-05' })
    expect(out.file.blurbs.a).toEqual(entry(a))
    expect(out.audit).toEqual({
      renamed: [],
      collided: [],
      retired: [],
      restored: [],
      stale: [],
      accepted: [],
      acceptNotFound: [],
    })
  })

  it('follows a rename (old id → new id) and marks the entry for review', () => {
    const old = loc('old-name', { name: 'Old Name' })
    const renamed = { ...old, id: 'new-name', name: 'New Name' }
    const out = syncBlurbs(file({ 'old-name': entry(old) }), [renamed], {
      renames: new Map([['old-name', 'new-name']]),
      today: '2026-09-05',
    })
    expect(out.file.blurbs['old-name']).toBeUndefined()
    expect(out.file.blurbs['new-name'].text).toBe('about old-name')
    expect(out.file.blurbs['new-name'].needsReview).toMatch(/name changed/)
    expect(out.audit.renamed).toEqual(['old-name -> new-name'])
    expect(out.audit.stale).toEqual(['new-name'])
  })

  it('a rename onto an id that already has a blurb retires the incoming one (never last-key-wins)', () => {
    // dedupeById can rename "coffee-shop" -> "corner-cafe" while "corner-cafe"
    // already exists (and already has its own blurb). Both texts must survive:
    // the existing entry keeps its id, the renamed one is retired under its
    // OLD id with a pointer to the collision — deterministic and auditable.
    const cafe = loc('corner-cafe', { name: 'Corner Cafe' })
    const shop = loc('coffee-shop', { name: 'Coffee Shop' })
    for (const order of [
      { 'corner-cafe': entry(cafe), 'coffee-shop': entry(shop) },
      { 'coffee-shop': entry(shop), 'corner-cafe': entry(cafe) },
    ]) {
      const out = syncBlurbs(file(order), [cafe], {
        renames: new Map([['coffee-shop', 'corner-cafe']]),
        today: '2026-09-05',
      })
      expect(out.file.blurbs['corner-cafe']).toEqual(entry(cafe))
      expect(out.file.retired['coffee-shop']).toEqual({
        ...entry(shop),
        retiredOn: '2026-09-05',
        collidedWith: 'corner-cafe',
      })
      expect(out.audit.renamed).toEqual([])
      expect(out.audit.collided).toEqual(['coffee-shop -> corner-cafe'])
      expect(out.audit.stale).toEqual([])
    }
  })

  it('retires (never deletes) the blurb of a location that left the dataset', () => {
    const a = loc('a')
    const gone = loc('gone')
    const out = syncBlurbs(file({ a: entry(a), gone: entry(gone) }), [a], {
      today: '2026-09-05',
    })
    expect(out.file.blurbs.gone).toBeUndefined()
    expect(out.file.retired.gone).toEqual({
      ...entry(gone),
      retiredOn: '2026-09-05',
    })
    expect(out.audit.retired).toEqual(['gone'])
  })

  it('restores a retired blurb when its id comes back (re-adds happen)', () => {
    const back = loc('back')
    const out = syncBlurbs(
      file({}, { back: { ...entry(back), retiredOn: '2026-08-01' } }),
      [back],
      { today: '2026-09-05' },
    )
    expect(out.file.retired?.back).toBeUndefined()
    expect(out.file.blurbs.back).toEqual(entry(back))
    expect(out.audit.restored).toEqual(['back'])
  })

  it('marks a moved/renamed-in-place location for review without touching the text', () => {
    const a = loc('a', { name: 'A' })
    const moved = { ...a, lat: a.lat + 0.02 }
    const out = syncBlurbs(file({ a: entry(a) }), [moved], {
      today: '2026-09-05',
    })
    expect(out.file.blurbs.a.text).toBe('about a')
    expect(out.file.blurbs.a.needsReview).toMatch(/moved/)
    expect(out.audit.stale).toEqual(['a'])
  })

  it('--accept re-snapshots the named ids and clears the review flag', () => {
    const a = loc('a', { name: 'A' })
    const moved = { ...a, lat: a.lat + 0.02, name: 'A2' }
    const out = syncBlurbs(
      file({ a: entry(a, { needsReview: 'moved 2 km' }) }),
      [moved],
      { accept: ['a'], today: '2026-09-05' },
    )
    expect(out.file.blurbs.a.needsReview).toBeUndefined()
    expect(out.file.blurbs.a.writtenFor).toEqual(snapshotFor(moved))
    expect(out.file.blurbs.a.writtenOn).toBe('2026-09-05')
    expect(out.audit.accepted).toEqual(['a'])
    expect(out.audit.stale).toEqual([])
  })

  it('accept fills a missing snapshot (first-time authoring)', () => {
    const a = loc('a')
    const out = syncBlurbs(file({ a: { text: 'hand-written' } }), [a], {
      accept: ['a'],
      today: '2026-09-05',
    })
    expect(out.file.blurbs.a.writtenFor).toEqual(snapshotFor(a))
  })

  it('reports an --accept id that matches no live blurb (typo, or a retired id)', () => {
    const a = loc('a')
    const out = syncBlurbs(
      file(
        { a: entry(a) },
        { gone: { ...entry(loc('gone')), retiredOn: 'x' } },
      ),
      [a],
      { accept: ['typo-id', 'gone'], today: '2026-09-05' },
    )
    expect(out.audit.accepted).toEqual([])
    expect(out.audit.acceptNotFound).toEqual(['gone', 'typo-id'])
  })

  it('does not mutate its inputs and keeps ids sorted for stable diffs', () => {
    const b = loc('b')
    const a = loc('a')
    const input = file({ b: entry(b), a: entry(a) })
    const snapshot = JSON.parse(JSON.stringify(input))
    const out = syncBlurbs(input, [a, b], { today: '2026-09-05' })
    expect(input).toEqual(snapshot)
    expect(Object.keys(out.file.blurbs)).toEqual(['a', 'b'])
  })
})
