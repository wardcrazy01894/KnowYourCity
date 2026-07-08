// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

/**
 * DOM-level test for the standing shown after a changed-set REPLAY that scored
 * LOWER than the first play. The board is one-row-per-device (its best score),
 * so every standing computation must speak in the viewer's BEST score — review
 * of the rank-dedup PR caught refreshStanding being fed the CURRENT run's
 * score, which counted the viewer's own better row as a competitor and showed
 * "2nd of 2" while flagging their board row at rank 1.
 *
 * Network functions are mocked; refreshStanding/formatStanding stay REAL —
 * they're what this test pins.
 */

const { submitDailyScore, fetchLeaderboard } = vi.hoisted(() => ({
  submitDailyScore: vi.fn(async () => ({ rank: 1, total: 2 })),
  fetchLeaderboard: vi.fn(async () => ({ total: 2, scores: [400, 300] })),
}))
vi.mock('../lib/leaderboard', async (importActual) => ({
  ...(await importActual<typeof import('../lib/leaderboard')>()),
  submitDailyScore,
  fetchLeaderboard,
}))

import { Results } from './Results'
import { saveState, STORAGE_VERSION } from '../lib/storage'
import type { RoundResult } from '../types'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function result(score: number): RoundResult {
  return {
    location: {
      id: `loc-${score}`,
      name: 'X',
      lat: 0,
      lng: 0,
      category: 'attraction',
      source: 'manual',
      attribution: 't',
    },
    guess: { lat: 0, lng: 0 },
    distanceMeters: 0,
    score,
  }
}

it('a lower-scoring replay still shows the standing of the device’s BEST entry', async () => {
  // History: first play 400 (old lineup), replay 350 (changed lineup).
  saveState('t', {
    version: STORAGE_VERSION,
    current: undefined,
    history: [
      { dateKey: '2026-07-08', lineup: 'aaaa', totalScore: 400, results: [] },
      { dateKey: '2026-07-08', lineup: 'bbbb', totalScore: 350, results: [] },
    ],
    streak: { current: 1, best: 1, lastPlayedDateKey: '2026-07-08' },
  })
  render(
    <Results
      cityId="t"
      cityShort="T"
      dateKey="2026-07-08"
      timeZone="America/New_York"
      results={[result(70), result(70), result(70), result(70), result(70)]}
      totalScore={350}
      lineup="bbbb"
      streak={{ current: 1, best: 1 }}
      official={true}
    />,
  )
  // Server said rank 1 of 2 (best-of-device); the fresh-read refresh must not
  // demote it by counting the viewer's own 400 row as a competitor.
  expect(await screen.findByText(/1st of 2/)).toBeTruthy()
})
