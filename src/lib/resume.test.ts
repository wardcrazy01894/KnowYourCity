import { describe, it, expect } from 'vitest'
import { sameLineup, freshGame, resolveInitialGame } from './resume'
import type { GameState, Location } from '../types'

function loc(id: string): Location {
  return {
    id,
    name: id,
    lat: 27.77,
    lng: -82.63,
    category: 'attraction',
    source: 'manual',
    attribution: 'test',
  }
}

const lineup = (ids: string[]) => ids.map(loc)

function savedGame(dateKey: string, ids: string[]): GameState {
  return {
    dateKey,
    locations: lineup(ids),
    roundIndex: 5,
    results: [],
    phase: 'finished',
  }
}

describe('sameLineup', () => {
  it('true for identical ids in identical order', () => {
    expect(sameLineup(lineup(['a', 'b', 'c']), lineup(['a', 'b', 'c']))).toBe(
      true,
    )
  })

  it('false when order differs', () => {
    expect(sameLineup(lineup(['a', 'b', 'c']), lineup(['a', 'c', 'b']))).toBe(
      false,
    )
  })

  it('false when an id differs', () => {
    expect(sameLineup(lineup(['a', 'b', 'c']), lineup(['a', 'b', 'd']))).toBe(
      false,
    )
  })

  it('false when length differs', () => {
    expect(sameLineup(lineup(['a', 'b']), lineup(['a', 'b', 'c']))).toBe(false)
  })
})

describe('freshGame', () => {
  it('starts an unplayed game for the lineup', () => {
    const g = freshGame('2026-06-16', lineup(['a', 'b']))
    expect(g).toEqual({
      dateKey: '2026-06-16',
      locations: lineup(['a', 'b']),
      roundIndex: 0,
      results: [],
      phase: 'guessing',
    })
  })
})

describe('resolveInitialGame', () => {
  const today = '2026-06-16'
  const todays = lineup(['a', 'b', 'c'])

  it('resumes the saved game when day + lineup match', () => {
    const saved = savedGame(today, ['a', 'b', 'c'])
    expect(resolveInitialGame(saved, today, todays)).toBe(saved)
  })

  it('starts fresh when there is no saved game', () => {
    expect(resolveInitialGame(undefined, today, todays)).toEqual(
      freshGame(today, todays),
    )
  })

  it('starts fresh when the saved game is for another day', () => {
    const saved = savedGame('2026-06-15', ['a', 'b', 'c'])
    expect(resolveInitialGame(saved, today, todays)).toEqual(
      freshGame(today, todays),
    )
  })

  // The bug fix: a venue was removed / an override edited after the player
  // finished, so today's freshly-selected lineup no longer matches the stored
  // one. Don't replay the stale lineup — start fresh so the NEW set is playable.
  it('starts fresh when the lineup changed since the saved game', () => {
    const saved = savedGame(today, ['a', 'b', 'OLD'])
    const result = resolveInitialGame(saved, today, todays)
    expect(result).not.toBe(saved)
    expect(result.locations.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(result.phase).toBe('guessing')
  })
})
