// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup } from '@testing-library/react'

/**
 * DOM-level test for the strong-finish celebration wiring in <Results>: it must
 * fire confetti + the cheer exactly once, only when the day qualifies, and — the
 * regression that bit us — NOT twice under React StrictMode's dev double-mount.
 *
 * The confetti + sound side effects are mocked (we assert they're invoked, not
 * what they render/play). `playCheer` is swapped in while keeping the rest of the
 * sound module real, since lib/celebrate.ts depends on `scoreTier` from it.
 */

const { fireConfetti, playCheer } = vi.hoisted(() => ({
  fireConfetti: vi.fn(),
  playCheer: vi.fn(),
}))
vi.mock('../lib/confetti', () => ({ fireConfetti }))
vi.mock('../lib/sound', async (importActual) => ({
  ...(await importActual<typeof import('../lib/sound')>()),
  playCheer,
}))

import { Results } from './Results'
import type { RoundResult } from '../types'

function result(score: number): RoundResult {
  return {
    location: {
      id: String(score),
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

function renderResults(
  results: RoundResult[],
  totalScore: number,
  strict = false,
) {
  const ui = (
    <Results
      cityId="t"
      cityShort="T"
      dateKey="2026-06-17"
      results={results}
      totalScore={totalScore}
      lineup="L"
      streak={{ current: 1, best: 1 }}
      official={false}
    />
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

afterEach(() => {
  cleanup()
  fireConfetti.mockReset()
  playCheer.mockReset()
})

describe('Results strong-finish celebration', () => {
  it('fires confetti + cheer once on a strong finish (4+ greens)', () => {
    renderResults(
      [result(90), result(90), result(90), result(90), result(0)],
      360,
    )
    expect(fireConfetti).toHaveBeenCalledTimes(1)
    expect(playCheer).toHaveBeenCalledTimes(1)
  })

  it('does not celebrate a weak finish', () => {
    renderResults(
      [result(40), result(30), result(20), result(10), result(0)],
      100,
    )
    expect(fireConfetti).not.toHaveBeenCalled()
    expect(playCheer).not.toHaveBeenCalled()
  })

  it('fires exactly once under StrictMode (no dev double-fire)', () => {
    renderResults(
      [result(100), result(100), result(100), result(100), result(100)],
      500,
      true,
    )
    expect(fireConfetti).toHaveBeenCalledTimes(1)
    expect(playCheer).toHaveBeenCalledTimes(1)
  })
})
