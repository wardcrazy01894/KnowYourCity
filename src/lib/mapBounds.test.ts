import { describe, expect, it } from 'vitest'
import { padBounds, MAX_BOUNDS_PAD } from './mapBounds'

describe('padBounds', () => {
  it('expands each side by the given ratio of that axis extent', () => {
    // 1° tall × 2° wide box, padded 30% per side.
    const padded = padBounds(
      [
        [27, -84],
        [28, -82],
      ],
      0.3,
    )
    expect(padded).toEqual([
      [26.7, -84.6],
      [28.3, -81.4],
    ])
  })

  it('returns the same box for ratio 0', () => {
    const bounds: [[number, number], [number, number]] = [
      [47.48, -122.46],
      [47.75, -122.22],
    ]
    expect(padBounds(bounds, 0)).toEqual(bounds)
  })

  it('defaults to MAX_BOUNDS_PAD and does not mutate the input', () => {
    const bounds: [[number, number], [number, number]] = [
      [27, -84],
      [28, -82],
    ]
    const padded = padBounds(bounds)
    expect(padded).toEqual(padBounds(bounds, MAX_BOUNDS_PAD))
    expect(bounds).toEqual([
      [27, -84],
      [28, -82],
    ])
    // The default pad must actually widen the box (the whole point of #71).
    expect(MAX_BOUNDS_PAD).toBeGreaterThan(0)
    expect(padded[0][0]).toBeLessThan(27)
    expect(padded[1][0]).toBeGreaterThan(28)
  })
})
