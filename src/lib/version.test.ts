import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  versionCheckAction,
  shouldDeferReload,
  fetchRemoteHash,
} from './version'
import { log } from './log'
import type { GameState } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('auto-reloads when a new deploy is out and a reload is non-disruptive', () => {
    expect(versionCheckAction('abc123', 'def456', false)).toBe('reload')
  })

  it('defers (no reload, no banner) when a reload would disrupt the player', () => {
    // A later check auto-reloads once it's safe.
    expect(versionCheckAction('abc123', 'def456', true)).toBe('defer')
  })

  it('treats "dev" fallback hash the same as any other value', () => {
    expect(versionCheckAction('dev', 'dev', false)).toBe('noop')
    expect(versionCheckAction('dev', 'abc123', false)).toBe('reload')
  })
})

describe('shouldDeferReload', () => {
  const today = '2026-06-18'

  it('does not defer when there is no saved game (picker/cleared)', () => {
    expect(shouldDeferReload(undefined, today)).toBe(false)
  })

  it("does not defer on today's results — reload re-shows the same results", () => {
    // The friend-missed-the-confetti case: finished today → auto-reload re-shows
    // results (now with the new feature), without leaving the screen.
    expect(shouldDeferReload(game({ phase: 'finished' }), today)).toBe(false)
  })

  it('defers mid-round so we never interrupt a guess', () => {
    expect(shouldDeferReload(game({ phase: 'guessing' }), today)).toBe(true)
    expect(shouldDeferReload(game({ phase: 'revealed' }), today)).toBe(true)
  })

  it('defers on a finished game from a PAST day (results after rollover)', () => {
    // Don't auto-reload someone off yesterday's results into today's new game —
    // starting the next day is their click.
    expect(
      shouldDeferReload(
        game({ phase: 'finished', dateKey: '2026-06-17' }),
        today,
      ),
    ).toBe(true)
  })

  it('defers on any unfinished game from a different day too', () => {
    expect(shouldDeferReload(game({ dateKey: '2026-06-17' }), today)).toBe(true)
  })
})

describe('fetchRemoteHash', () => {
  const res = (over: Partial<Response> = {}) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ hash: 'abc123' }),
      ...over,
    }) as Response

  it('returns the deployed hash on a good response', async () => {
    const fetchFn = vi.fn(async () => res()) as unknown as typeof fetch
    expect(await fetchRemoteHash(fetchFn)).toBe('abc123')
  })

  it('returns null and logs the HTTP status when /version.json is failing', async () => {
    // A persistent 404/500 after a bad deploy means players silently stop
    // auto-updating — that must be diagnosable from kycDumpLogs() alone.
    const warn = vi.spyOn(log, 'warn')
    const fetchFn = vi.fn(async () =>
      res({ ok: false, status: 404 }),
    ) as unknown as typeof fetch
    expect(await fetchRemoteHash(fetchFn)).toBeNull()
    const call = warn.mock.calls.find((c) => /version/i.test(String(c[1])))
    expect(JSON.stringify(call)).toMatch(/404/)
  })

  it('returns null and logs when version.json is malformed', async () => {
    const warn = vi.spyOn(log, 'warn')
    const fetchFn = vi.fn(async () =>
      res({ json: async () => ({ nope: true }) }),
    ) as unknown as typeof fetch
    expect(await fetchRemoteHash(fetchFn)).toBeNull()
    const call = warn.mock.calls.find((c) => /version/i.test(String(c[1])))
    expect(JSON.stringify(call)).toMatch(/malformed/)
  })

  it('returns null quietly (debug level) on a network error', async () => {
    // Offline/fetch-blocked is expected transient noise — keep it at debug so
    // normal play isn't noisy, but still traceable under ?debug.
    const debug = vi.spyOn(log, 'debug')
    const fetchFn = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await fetchRemoteHash(fetchFn)).toBeNull()
    const call = debug.mock.calls.find((c) => /version/i.test(String(c[1])))
    expect(JSON.stringify(call)).toMatch(/offline/)
  })
})
