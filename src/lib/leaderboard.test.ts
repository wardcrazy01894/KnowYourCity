import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ordinal,
  percentile,
  formatStanding,
  getClientId,
  buildSubmitPayload,
  readStanding,
  submitDailyScore,
  fetchLeaderboard,
  refreshStanding,
  buildLeaderboardRows,
  PERCENTILE_MIN_TOTAL,
} from './leaderboard'
import { log } from './log'

/**
 * Minimal in-memory localStorage stub — vitest runs in the node environment (no
 * DOM), so we install a Storage-shaped object on globalThis (mirrors
 * storage.test.ts). Each test gets a fresh one.
 */
function makeStorageStub(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    clear: () => map.clear(),
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorageStub())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ordinal', () => {
  it('handles the common cases', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(102)).toBe('102nd')
  })
  it('handles the 11–13 teens exception', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(111)).toBe('111th')
  })
})

describe('percentile', () => {
  it('puts the top of the field at a small percent, clamped to ≥1', () => {
    expect(percentile(1, 100)).toBe(1)
    expect(percentile(50, 100)).toBe(50)
    expect(percentile(1, 1)).toBe(100)
  })
})

describe('formatStanding', () => {
  it('celebrates the first finisher (total 1)', () => {
    expect(formatStanding({ rank: 1, total: 1 })).toMatch(/first to finish/i)
  })
  it('shows plain rank for a small field (no noisy percentile)', () => {
    const s = formatStanding({ rank: 3, total: 7 })
    expect(s).toBe('You placed 3rd of 7 today')
    expect(s).not.toMatch(/top/)
  })
  it('adds a percentile once the field is large enough', () => {
    const s = formatStanding({ rank: 5, total: PERCENTILE_MIN_TOTAL })
    expect(s).toMatch(/of 20 today · top \d+%/)
  })
})

describe('getClientId', () => {
  it('mints a stable id and reuses it across calls', () => {
    const a = getClientId()
    const b = getClientId()
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(8)
  })
})

describe('buildSubmitPayload', () => {
  it('carries city/date/score + the anonymous clientId (no names/PII)', () => {
    const p = buildSubmitPayload({
      cityId: 'stpete',
      dateKey: '2026-06-15',
      score: 420,
      lineup: 'abc123',
      official: true,
    })
    expect(p).toMatchObject({
      city: 'stpete',
      date: '2026-06-15',
      score: 420,
      lineup: 'abc123',
    })
    expect(p.clientId).toBe(getClientId())
    // Nothing that could identify a person.
    expect(JSON.stringify(p)).not.toMatch(/name|email/i)
  })
})

describe('submitDailyScore', () => {
  const args = {
    cityId: 'stpete',
    dateKey: '2026-06-15',
    score: 420,
    lineup: 'abc123',
    official: true,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does NOT submit a non-official game (shuffle / date override)', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = await submitDailyScore({ ...args, official: false })
    expect(r).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('does NOT submit when no endpoint is configured', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', '')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await submitDailyScore(args)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('submits an official game and returns + caches the standing', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, rank: 3, total: 47 }),
    }))
    vi.stubGlobal('fetch', f)

    const r = await submitDailyScore(args)
    expect(r).toEqual({ rank: 3, total: 47 })
    expect(f).toHaveBeenCalledOnce()
    // Cached per (city, date, lineup) so a reload won't re-POST.
    expect(readStanding('stpete', '2026-06-15', 'abc123')).toEqual({
      rank: 3,
      total: 47,
    })

    await submitDailyScore(args)
    expect(f).toHaveBeenCalledOnce() // still once — served from cache
  })

  it('re-POSTs when the lineup changed (a replay adds its own row)', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, rank: 5, total: 48 }),
    }))
    vi.stubGlobal('fetch', f)

    await submitDailyScore(args) // lineup 'abc123'
    expect(f).toHaveBeenCalledOnce()
    // Same day, DIFFERENT lineup → cache miss → a second POST (a new board row).
    await submitDailyScore({ ...args, lineup: 'def456', score: 380 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('resolves null (never throws) when the request fails', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await submitDailyScore(args)).toBeNull()
  })

  it('logs a warning with the server status + reason when a submit is rejected', async () => {
    // The exact diagnosis we lacked for the negative-lineup 400: surface the
    // status AND the server's error body so it shows up in window.kycDumpLogs().
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'invalid lineup' }),
      })),
    )
    const warn = vi.spyOn(log, 'warn')
    expect(await submitDailyScore(args)).toBeNull()
    const call = warn.mock.calls.find((c) => /reject/i.test(String(c[1])))
    expect(call).toBeTruthy()
    expect(JSON.stringify(call?.[2])).toMatch(/400/)
    expect(JSON.stringify(call?.[2])).toMatch(/invalid lineup/)
  })

  it('logs a warning when a submit throws (offline)', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const warn = vi.spyOn(log, 'warn')
    expect(await submitDailyScore(args)).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('parses the server streak into the standing when present', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          rank: 2,
          total: 10,
          streak: { current: 4, best: 7 },
        }),
      })),
    )
    const r = await submitDailyScore(args)
    expect(r).toEqual({ rank: 2, total: 10, streak: { current: 4, best: 7 } })
  })
})

describe('buildLeaderboardRows', () => {
  it('ranks highest-first with ties sharing a rank (competition ranking)', () => {
    expect(buildLeaderboardRows([420, 480, 480, 300])).toEqual([
      { rank: 1, score: 480, you: false },
      { rank: 1, score: 480, you: false },
      { rank: 3, score: 420, you: false },
      { rank: 4, score: 300, you: false },
    ])
  })

  it('flags the first row matching the viewer’s score as "you"', () => {
    const rows = buildLeaderboardRows([480, 420, 420], [420])
    expect(rows.filter((r) => r.you)).toHaveLength(1)
    expect(rows.find((r) => r.you)).toMatchObject({ rank: 2, score: 420 })
  })

  it('marks nobody when the viewer’s score is absent', () => {
    expect(buildLeaderboardRows([480, 420], [333]).some((r) => r.you)).toBe(
      false,
    )
  })

  // A player who replayed a changed lineup has TWO scores on the day's board;
  // both their rows are flagged (multiset), distinct scores or tied.
  it('flags both of the viewer’s scores when they have two entries', () => {
    const rows = buildLeaderboardRows([480, 420, 380, 300], [420, 380])
    expect(rows.filter((r) => r.you).map((r) => r.score)).toEqual([420, 380])
  })

  it('flags exactly N rows when the viewer has N tied entries', () => {
    const rows = buildLeaderboardRows([480, 380, 380, 380], [380, 380])
    expect(rows.filter((r) => r.you)).toHaveLength(2)
  })
})

describe('refreshStanding', () => {
  it('refreshes total and recomputes the exact rank for an uncapped field', () => {
    // Cached "2nd of 3" from the morning; the board now has everyone (uncapped)
    // and more players. Your 460 has two higher scores → 3rd.
    const r = refreshStanding(
      { rank: 2, total: 3 },
      { total: 5, scores: [500, 480, 460, 440, 420] },
      460,
    )
    expect(r).toEqual({ rank: 3, total: 5 })
  })

  it('keeps the cached streak while refreshing the numbers', () => {
    const r = refreshStanding(
      { rank: 1, total: 1, streak: { current: 4, best: 7 } },
      { total: 2, scores: [500, 480] },
      500,
    )
    expect(r.streak).toEqual({ current: 4, best: 7 })
    expect(r).toMatchObject({ rank: 1, total: 2 })
  })

  it('computes the exact rank when the score reaches into a capped window', () => {
    // Server returned only the top 3 of 200, but your 460 == the smallest
    // returned, so every higher score is in the window → rank is exact.
    const r = refreshStanding(
      { rank: 1, total: 50 },
      { total: 200, scores: [500, 480, 460] },
      460,
    )
    expect(r).toEqual({ rank: 3, total: 200 })
  })

  it('keeps the cached rank when the player is below a capped window', () => {
    // Top-3 of 200 returned; your 300 is below the smallest returned (460), so an
    // exact rank can't be derived — keep the cached submit rank, refresh total.
    const r = refreshStanding(
      { rank: 150, total: 80 },
      { total: 200, scores: [500, 480, 460] },
      300,
    )
    expect(r).toEqual({ rank: 150, total: 200 })
  })

  it('floors the fallback rank at the returned window size + 1', () => {
    const r = refreshStanding(
      { rank: 2, total: 10 }, // implausibly good for a below-window score
      { total: 200, scores: [500, 480, 460] },
      300,
    )
    expect(r.rank).toBe(4) // 3 returned → at best 4th
    expect(r.total).toBe(200)
  })
})

describe('fetchLeaderboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('logs a warning with the status when a read is rejected', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example/')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => null })),
    )
    const warn = vi.spyOn(log, 'warn')
    expect(await fetchLeaderboard('stpete', '2026-06-15')).toBeNull()
    const call = warn.mock.calls.find((c) => /reject/i.test(String(c[1])))
    expect(call).toBeTruthy()
    expect(JSON.stringify(call?.[2])).toMatch(/503/)
  })

  it('returns null when no endpoint is configured', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', '')
    expect(await fetchLeaderboard('stpete', '2026-06-15')).toBeNull()
  })

  it('fetches scores + total with city/date query params', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example/')
    let calledUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calledUrl = url
        return {
          ok: true,
          json: async () => ({ total: 9, scores: [500, 480] }),
        }
      }),
    )
    const data = await fetchLeaderboard('stpete', '2026-06-15')
    expect(data).toEqual({ total: 9, scores: [500, 480] })
    expect(calledUrl).toContain('city=stpete')
    expect(calledUrl).toContain('date=2026-06-15')
  })

  it('resolves null (never throws) on a failed request', async () => {
    vi.stubEnv('VITE_LEADERBOARD_ENDPOINT', 'https://lb.example/')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await fetchLeaderboard('stpete', '2026-06-15')).toBeNull()
  })
})
