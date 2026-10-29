import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
// node:sqlite needs Node >= 22.5 (package.json `engines` enforces this).
import { DatabaseSync } from 'node:sqlite'
import {
  upsertAndRank,
  topScores,
  pruneIfDue,
  updateStreak,
} from './leaderboard-lib.mjs'

/**
 * SQL-level tests for the standing/board queries against a REAL SQLite with the
 * REAL migrations. The handler tests stub db.batch entirely, so without these
 * the query SEMANTICS (what counts as a competitor, what `total` means) are
 * unpinned — exactly where the replay-inflation bug lived: one device replaying
 * a changed lineup held 2 rows, inflating "of N today" and pushing every other
 * player's rank down by counting the same human twice.
 *
 * Board semantics under test: rows are stored per (client, lineup) — a genuine
 * replay keeps its own stored row — but rank/total/board are computed over each
 * DEVICE's best score for the day, so one human = one competitor.
 */

/** Minimal D1-shaped adapter over node:sqlite for the lib's query helpers. */
function d1(db) {
  const wrap = (sql, args) => ({
    sql,
    args,
    all: () => db.prepare(sql).all(...args),
    run: () => {
      const info = db.prepare(sql).run(...args)
      return { meta: { changes: Number(info.changes) } }
    },
    first: () => db.prepare(sql).all(...args)[0] ?? null,
  })
  return {
    // Like real D1, an unbound statement can run directly (pruneIfDue's
    // marker read has no params) or be bound first.
    prepare: (sql) => ({
      ...wrap(sql, []),
      bind: (...args) => wrap(sql, args),
    }),
    batch: async (stmts) => stmts.map((s) => ({ results: s.all() })),
  }
}

function freshDb() {
  const raw = new DatabaseSync(':memory:')
  const dir = new URL('./migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort()) {
    raw.exec(readFileSync(new URL(f, dir), 'utf8'))
  }
  return d1(raw)
}

let db
beforeEach(() => {
  db = freshDb()
})

const NOW = 1_760_000_000_000
const submit = (clientId, score, lineup) =>
  upsertAndRank(
    db,
    { city: 'stpete', date: '2026-07-08', clientId, score, lineup },
    NOW,
  )

describe('replay-aware standing (one human = one competitor)', () => {
  it('a replayer does not inflate the field: total counts devices, not rows', async () => {
    await submit('device-A', 400, 'aaaa')
    await submit('device-B', 300, 'aaaa')
    // A's official set changed mid-day; the replay stores its own row…
    await submit('device-A', 350, 'bbbb')
    // …but B still competes against ONE human A: 2 in the field, B behind A's
    // best only (not behind two copies of A).
    const b = await submit('device-B', 300, 'aaaa')
    expect(b.total).toBe(2)
    expect(b.rank).toBe(2)
  })

  it("rank reflects the device's BEST entry of the day", async () => {
    await submit('device-B', 300, 'aaaa')
    await submit('device-A', 400, 'aaaa')
    // A's replay scored lower, but their standing is still their best (400).
    const a = await submit('device-A', 350, 'bbbb')
    expect(a.rank).toBe(1)
    expect(a.total).toBe(2)
  })

  it('keep-max per lineup still holds (a reload cannot lower a stored score)', async () => {
    await submit('device-A', 400, 'aaaa')
    const again = await submit('device-A', 380, 'aaaa')
    expect(again.rank).toBe(1)
    const { scores } = await topScores(db, 'stpete', '2026-07-08')
    expect(scores).toEqual([400])
  })

  it('ties across devices share a rank (strictly-greater counting)', async () => {
    await submit('device-A', 400, 'aaaa')
    await submit('device-B', 400, 'aaaa')
    const c = await submit('device-C', 300, 'aaaa')
    expect(c.rank).toBe(3)
    expect(c.total).toBe(3)
  })
})

describe('topScores board (deduped to per-device best)', () => {
  it('shows one row per device — the best — and a device-count total', async () => {
    await submit('device-A', 400, 'aaaa')
    await submit('device-A', 350, 'bbbb') // replay row stays stored…
    await submit('device-B', 300, 'aaaa')
    const { scores, total } = await topScores(db, 'stpete', '2026-07-08')
    // …but the public board shows each human once.
    expect(scores).toEqual([400, 300])
    expect(total).toBe(2)
  })

  it('caps the returned rows at the limit but totals the whole field', async () => {
    for (let i = 0; i < 5; i++) await submit(`device-${i}`, 100 + i, 'aaaa')
    const { scores, total } = await topScores(db, 'stpete', '2026-07-08', 3)
    expect(scores).toEqual([104, 103, 102])
    expect(total).toBe(5)
  })
})

describe('lazy prune (pruneIfDue — replaces the Cron Trigger)', () => {
  const at = (clientId, date) =>
    upsertAndRank(
      db,
      { city: 'stpete', date, clientId, score: 400, lineup: 'aaaa' },
      NOW,
    )
  it('prunes once per UTC day, is a no-op until the next day, never touches streaks', async () => {
    const now = new Date('2026-07-08T12:00:00Z')
    await at('device-A', '2026-01-01') // older than 90 days
    await at('device-A', '2026-07-08')
    const who = { city: 'stpete', clientId: 'device-A', date: '2026-07-08' }
    await updateStreak(db, who, NOW) // a streak row that must survive
    expect(await pruneIfDue(db, now)).toBe(1)
    // Same-day replay → unchanged row proves the prune left streaks alone.
    expect(await updateStreak(db, who, NOW)).toEqual({ current: 1, best: 1 })
    await at('device-B', '2026-01-02') // another old row…
    expect(await pruneIfDue(db, now)).toBeNull() // …but today's prune already ran
    expect(await pruneIfDue(db, new Date('2026-07-09T00:00:01Z'))).toBe(1)
    expect((await topScores(db, 'stpete', '2026-07-08')).total).toBe(1)
  })
})
