import { describe, expect, it } from 'vitest'
import { versionCheckAction, gameInProgress } from './version'
import type { GameState } from '../types'

const game = (over: Partial<GameState> = {}): GameState => ({
  dateKey: '2026-06-18',
  locations: [],
  roundIndex: 0,
  results: [],
  phase: 'guessing',
  ...over,
})

describe('versionCheckAction', () => {
  it('returns noop when hashes match, regardless of progress', () => {
    expect(versionCheckAction('abc123', 'abc123', false)).toBe('noop')
    expect(versionCheckAction('abc123', 'abc123', true)).toBe('noop')
  })

  it('auto-reloads when a new deploy is out and no game is mid-round', () => {
    expect(versionCheckAction('abc123', 'def456', false)).toBe('reload')
  })

  it('shows the banner (no auto-reload) when a game is mid-round', () => {
    expect(versionCheckAction('abc123', 'def456', true)).toBe('banner')
  })

  it('treats "dev" fallback hash the same as any other value', () => {
    expect(versionCheckAction('dev', 'dev', false)).toBe('noop')
    expect(versionCheckAction('dev', 'abc123', false)).toBe('reload')
  })
})

describe('gameInProgress', () => {
  const today = '2026-06-18'

  it('is false when there is no saved game (safe to auto-reload)', () => {
    expect(gameInProgress(undefined, today)).toBe(false)
  })

  it('is false on the results screen — a finished game is safe to reload', () => {
    // This is the friend-missed-the-confetti case: finished → auto-reload.
    expect(gameInProgress(game({ phase: 'finished' }), today)).toBe(false)
  })

  it('is true mid-round so we banner instead of yanking the player', () => {
    expect(gameInProgress(game({ phase: 'guessing' }), today)).toBe(true)
    expect(gameInProgress(game({ phase: 'revealed' }), today)).toBe(true)
  })

  it('is false for a stale unfinished game from a previous day', () => {
    // Yesterday's abandoned game resets to fresh on load anyway — don't let it
    // block an auto-reload.
    expect(gameInProgress(game({ dateKey: '2026-06-17' }), today)).toBe(false)
  })
})
