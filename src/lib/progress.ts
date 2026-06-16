/**
 * Day-completion bookkeeping: folding a finished game into history + streak.
 *
 * A day's puzzle is identified by (dateKey, lineup) — the lineup being a short
 * hash of the day's location ids. Normally there's one lineup per date, so one
 * record. But the OFFICIAL daily set can change under a player mid-day (a venue
 * removed, an override edited); when that happens they're allowed to replay the
 * new set (see resume.ts), and that genuine second completion deserves its own
 * record AND its own leaderboard row. Both records are kept. The streak, by
 * contrast, is binary "did they complete the official game that day" — it bumps
 * once per calendar date no matter how many lineups get played.
 *
 * Pure (no storage/DOM) so it's unit-testable; Game.tsx supplies/persists state.
 */

import type { DayRecord, Location, RoundResult } from '../types'
import { hashStringToSeed } from './daily'

export interface Streak {
  current: number
  best: number
  lastPlayedDateKey: string | null
}

/** Calendar date key (YYYY-MM-DD) for the day before `dateKey`. UTC-safe. */
export function previousDateKey(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Streak after completing `dateKey`. Replaying the same date is a no-op (binary
 * "played"), a consecutive day increments, any gap resets to 1.
 */
export function bumpStreak(prev: Streak, dateKey: string): Streak {
  let current: number
  if (prev.lastPlayedDateKey === dateKey) current = prev.current
  else if (prev.lastPlayedDateKey === previousDateKey(dateKey))
    current = prev.current + 1
  else current = 1
  return {
    current,
    best: Math.max(prev.best, current),
    lastPlayedDateKey: dateKey,
  }
}

/**
 * Stable identity for a day's lineup: a short hash of its location ids in play
 * order. Distinguishes the normal official set from a changed set, so a genuine
 * replay is a distinct completion while a reload of the same game is not.
 */
export function lineupHash(locations: Pick<Location, 'id'>[]): string {
  return hashStringToSeed(locations.map((l) => l.id).join('|')).toString(36)
}

export interface CompletedDay {
  dateKey: string
  /** lineupHash of the set actually played. */
  lineup: string
  totalScore: number
  results: Array<Pick<RoundResult, 'distanceMeters' | 'score'>>
}

/**
 * Fold a finished game into history + streak. Each distinct (dateKey, lineup)
 * appends its own DayRecord — so replaying a day whose lineup changed adds a
 * SECOND record, both kept — while re-recording the same (dateKey, lineup) is a
 * no-op (the original is preserved). The streak bumps only on the FIRST
 * completion of a calendar date, regardless of how many lineups are played.
 */
export function recordCompletion(
  history: DayRecord[],
  streak: Streak,
  done: CompletedDay,
): { history: DayRecord[]; streak: Streak } {
  // A record written before `lineup` existed has `h.lineup === undefined`, which
  // never equals a real hash — so a legacy day, when replayed against a changed
  // set, correctly appends a new record rather than no-op'ing. (The streak is
  // still protected by `dateRecorded` below, so this can't double-count a date.)
  const lineupRecorded = history.some(
    (h) => h.dateKey === done.dateKey && h.lineup === done.lineup,
  )
  const dateRecorded = history.some((h) => h.dateKey === done.dateKey)
  const nextHistory = lineupRecorded
    ? history
    : [
        ...history,
        {
          dateKey: done.dateKey,
          totalScore: done.totalScore,
          results: done.results,
          lineup: done.lineup,
        },
      ]
  const nextStreak = dateRecorded ? streak : bumpStreak(streak, done.dateKey)
  return { history: nextHistory, streak: nextStreak }
}
