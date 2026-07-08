// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { Results } from './Results'
import type { RoundResult } from '../types'

/**
 * The day-rollover affordance (scan M3): the mounted session stays on its day
 * (App freezes the mode — resolveSessionMode), so advancing must be the
 * player's click. When the city-local date has moved past the results screen's
 * dateKey, Results shows a "Play today's puzzle" button; while the day is
 * still live it shows none.
 */

afterEach(cleanup)

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

function renderResults(dateKey: string) {
  return render(
    <Results
      cityId="t"
      cityShort="T"
      dateKey={dateKey}
      timeZone="America/New_York"
      results={[result(50)]}
      totalScore={50}
      lineup="L"
      streak={{ current: 1, best: 1 }}
      official={false}
    />,
  )
}

describe('Results day-rollover affordance', () => {
  it('offers "Play today’s puzzle" once the city-local day has moved on', async () => {
    renderResults('2026-01-01') // long past — the day has certainly rolled
    expect(await screen.findByText(/Play today’s puzzle/)).toBeTruthy()
    expect(screen.getByText(/Done for 2026-01-01/)).toBeTruthy()
  })

  it('shows no rollover button while the results are for the live day', () => {
    // Compute the REAL current city-local day, same code path as production.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
    }).format(new Date())
    renderResults(today)
    expect(screen.queryByText(/Play today’s puzzle/)).toBeNull()
    expect(screen.getByText(/Done for today!/)).toBeTruthy()
  })
})
