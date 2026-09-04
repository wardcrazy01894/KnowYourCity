// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup } from '@testing-library/react'
import { RecapMap } from './RecapMap'
import type { RoundResult } from '../types'

/**
 * Structural Leaflet net for RecapMap (same spirit as MapGuess.render.test.tsx):
 * one map under StrictMode, every round's guess pin + truth marker + distance
 * line + footprint polygon drawn, numbered labels in play order, and nothing
 * left behind on unmount. Checkable in jsdom without real tiles.
 */

const BOUNDS: [[number, number], [number, number]] = [
  [27.68, -82.75],
  [27.85, -82.55],
]

function result(i: number, polygon = false): RoundResult {
  const lat = 27.77 + i * 0.01
  const lng = -82.63 + i * 0.01
  return {
    location: {
      id: `loc-${i}`,
      name: `Place ${i}`,
      lat,
      lng,
      category: polygon ? 'park' : 'restaurant',
      source: 'manual',
      attribution: 't',
      ...(polygon
        ? {
            polygon: [
              [lat - 0.002, lng - 0.002],
              [lat - 0.002, lng + 0.002],
              [lat + 0.002, lng + 0.002],
              [lat + 0.002, lng - 0.002],
            ] as [number, number][],
          }
        : {}),
    },
    guess: { lat: lat + 0.003, lng: lng - 0.003 },
    distanceMeters: 400,
    score: 60,
  }
}

afterEach(cleanup)

describe('RecapMap Leaflet lifecycle', () => {
  it('creates exactly one map under StrictMode and draws every round', () => {
    const results = [result(0), result(1, true), result(2)]
    const { container } = render(
      <StrictMode>
        <RecapMap bounds={BOUNDS} results={results} />
      </StrictMode>,
    )
    expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(1)
    // Per round: 1 guess circle + 1 dashed line (+ 1 polygon ring for the park)
    // — all SVG paths in the overlay pane. Truth markers are numbered divIcons.
    expect(
      container.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(3 * 2 + 1)
    const labels = [...container.querySelectorAll('.recap-marker')].map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(['1', '2', '3'])
  })

  it('removes every layer on unmount (no leak into the next mount)', () => {
    const { container, unmount } = render(
      <StrictMode>
        <RecapMap bounds={BOUNDS} results={[result(0), result(1)]} />
      </StrictMode>,
    )
    unmount()
    expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(0)
    expect(container.querySelectorAll('.recap-marker')).toHaveLength(0)
  })

  it('re-frames on focus without duplicating layers', () => {
    const results = [result(0), result(1)]
    const { container, rerender } = render(
      <StrictMode>
        <RecapMap bounds={BOUNDS} results={results} focus={null} />
      </StrictMode>,
    )
    rerender(
      <StrictMode>
        <RecapMap bounds={BOUNDS} results={results} focus={1} />
      </StrictMode>,
    )
    expect(container.querySelectorAll('.recap-marker')).toHaveLength(2)
    expect(
      container.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(4)
  })
})
