// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup } from '@testing-library/react'
import { MapGuess } from './MapGuess'
import type { Location } from '../types'

/**
 * Leaflet lifecycle net for MapGuess, added with the React 18→19 bump (#168).
 *
 * MapGuess is the one component with no render coverage — CLAUDE.md says the
 * React/Leaflet shells get verified manually — but it is also the component
 * most exposed to a React major: it drives Leaflet imperatively through six
 * refs, writes two of them during render (the "latest ref" idiom), and
 * creates/destroys map layers in effects. React 19 changes ref handling and
 * StrictMode remount semantics, so "the suite is green" was not evidence about
 * this file at all.
 *
 * These assertions are deliberately structural rather than visual: under
 * StrictMode's double-invoke, exactly one map must exist and no round's layers
 * may survive into the next. That is what a ref/effect regression would break,
 * and it is checkable in jsdom without real tiles.
 */

const BOUNDS: [[number, number], [number, number]] = [
  [27.68, -82.75],
  [27.85, -82.55],
]

const loc = (id: string, lat: number, lng: number): Location => ({
  id,
  name: id,
  lat,
  lng,
  category: 'landmark',
  source: 'manual',
  attribution: 'test fixture',
})

afterEach(cleanup)

describe('MapGuess Leaflet lifecycle', () => {
  it('creates exactly one map under StrictMode double-invoke', () => {
    const { container } = render(
      <StrictMode>
        <MapGuess bounds={BOUNDS} guess={null} onGuessChange={() => {}} />
      </StrictMode>,
    )
    // Two map instances on one container is the classic StrictMode/ref
    // double-init regression.
    expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(1)
  })

  it('does not leak reveal layers across rounds', () => {
    const { container, rerender } = render(
      <StrictMode>
        <MapGuess
          bounds={BOUNDS}
          guess={{ lat: 27.77, lng: -82.63 }}
          onGuessChange={() => {}}
          reveal={{
            location: loc('round-1', 27.7701, -82.6301),
            distanceMeters: 120,
          }}
          locked
          resetViewKey={0}
        />
      </StrictMode>,
    )
    const revealed = container.querySelectorAll('.leaflet-overlay-pane path')
    expect(revealed.length).toBeGreaterThan(0)

    // Advance to a fresh, unrevealed round: every truth marker, distance line
    // and polygon from the previous round must be gone.
    rerender(
      <StrictMode>
        <MapGuess
          bounds={BOUNDS}
          guess={null}
          onGuessChange={() => {}}
          reveal={null}
          resetViewKey={1}
        />
      </StrictMode>,
    )
    expect(
      container.querySelectorAll('.leaflet-overlay-pane path'),
    ).toHaveLength(0)
    expect(container.querySelectorAll('.leaflet-tooltip')).toHaveLength(0)
    expect(container.querySelectorAll('.leaflet-map-pane')).toHaveLength(1)
  })
})
