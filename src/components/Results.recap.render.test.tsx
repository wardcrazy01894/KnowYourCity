// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Results } from './Results'
import { BLURB_PLACEHOLDER } from '../lib/blurbs'
import type { RoundResult } from '../types'

/**
 * DOM-level test for the end-of-day recap entry point: the results screen must
 * offer a prominent "Learn about today's locations" button; opening it shows
 * every round (map + one card each) with the written blurb where one exists
 * and the rollout placeholder everywhere else; "back" returns to the results.
 *
 * The blurb sidecar fetch is stubbed at the network layer (global fetch) so the
 * real fetchBlurbs/resolveBlurb code paths are exercised.
 */

const BOUNDS: [[number, number], [number, number]] = [
  [27.62, -82.79],
  [27.87, -82.58],
]

function result(id: string, score: number): RoundResult {
  return {
    location: {
      id,
      name: `Name of ${id}`,
      lat: 27.77,
      lng: -82.63,
      category: 'restaurant',
      source: 'manual',
      attribution: 't',
    },
    guess: { lat: 27.78, lng: -82.64 },
    distanceMeters: 1234,
    score,
  }
}

const RESULTS = [
  result('one', 90),
  result('two', 70),
  result('three', 50),
  result('four', 30),
  result('five', 10),
]

function renderResults() {
  return render(
    <Results
      cityId="stpete"
      cityShort="St. Pete"
      dateKey="2026-09-04"
      timeZone="America/New_York"
      bounds={BOUNDS}
      results={RESULTS}
      totalScore={250}
      lineup="L"
      streak={{ current: 1, best: 1 }}
      official={false}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Results → day recap', () => {
  it('opens the recap with a placeholder for every unwritten spot, and returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    renderResults()
    fireEvent.click(
      screen.getByRole('button', { name: /learn about today’s locations/i }),
    )
    // Every round gets a card, in play order, with the rollout placeholder.
    expect(await screen.findAllByText(BLURB_PLACEHOLDER)).toHaveLength(5)
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(names).toEqual(RESULTS.map((r) => r.location.name))
    // The map is on screen with a numbered marker per round.
    expect(document.querySelectorAll('.recap-marker')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText(/done for today/i)).toBeTruthy()
    expect(document.querySelectorAll('.recap-marker')).toHaveLength(0)
  })

  it('shows the written blurb (and its source link) where one exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              version: 1,
              city: 'stpete',
              blurbs: {
                two: {
                  text: 'Famous for its Sunday brunch line.',
                  sources: ['https://example.org/two'],
                },
              },
            }),
            { status: 200 },
          ),
      ),
    )
    renderResults()
    fireEvent.click(
      screen.getByRole('button', { name: /learn about today’s locations/i }),
    )
    expect(
      await screen.findByText('Famous for its Sunday brunch line.'),
    ).toBeTruthy()
    expect(screen.getAllByText(BLURB_PLACEHOLDER)).toHaveLength(4)
    const link = screen.getByRole('link', { name: /example\.org/ })
    expect(link.getAttribute('href')).toBe('https://example.org/two')
    expect(link.getAttribute('rel')).toMatch(/noreferrer/)
  })

  it('shows a per-card loading line until the blurb fetch settles', () => {
    // A fetch that never resolves during the test: the cards must still render
    // (name, distance, points) with a "Loading…" line in the blurb slot.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderResults()
    fireEvent.click(
      screen.getByRole('button', { name: /learn about today’s locations/i }),
    )
    expect(screen.getAllByText('Loading…')).toHaveLength(5)
    expect(screen.queryByText(BLURB_PLACEHOLDER)).toBeNull()
  })

  it('shows the descriptor for a researched spot with no story, and both when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              version: 1,
              city: 'stpete',
              blurbs: {
                two: {
                  text: '',
                  descriptor: 'Cuban sandwich counter on Central Ave',
                },
                three: {
                  text: 'Opened in 1948 by two brothers.',
                  descriptor: 'Old-school seafood house',
                },
              },
            }),
            { status: 200 },
          ),
      ),
    )
    renderResults()
    fireEvent.click(
      screen.getByRole('button', { name: /learn about today’s locations/i }),
    )
    expect(
      await screen.findByText('Cuban sandwich counter on Central Ave'),
    ).toBeTruthy()
    expect(screen.getByText('Old-school seafood house')).toBeTruthy()
    expect(screen.getByText('Opened in 1948 by two brothers.')).toBeTruthy()
    // Only the three never-researched spots show the placeholder.
    expect(screen.getAllByText(BLURB_PLACEHOLDER)).toHaveLength(3)
  })
})
