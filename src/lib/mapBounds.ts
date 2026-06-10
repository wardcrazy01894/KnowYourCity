/**
 * Map-bounds helpers (pure — no Leaflet/DOM so they're unit-testable).
 *
 * Why padding exists (#71): MapGuess locks the map with `maxBounds` +
 * `maxBoundsViscosity: 1`. With maxBounds set to EXACTLY the play bounds, the
 * hard wall sits flush against playable locations: integer zoom snapping can
 * leave a whole axis unpannable just above min zoom, and a location on the
 * bounds edge can never be panned toward the screen center. Padding the lock
 * box (but NOT the min-zoom fit) keeps players near the city while giving the
 * viewport room to reach every corner of the play area.
 */

export type LatLngBoundsTuple = [[number, number], [number, number]]

/** How much slack MapGuess gives `maxBounds` around the play area, per side. */
export const MAX_BOUNDS_PAD = 0.3

/** Expand a [[south, west], [north, east]] box by `ratio` of each axis extent
 *  on every side (mirrors Leaflet's `LatLngBounds.pad`). */
export function padBounds(
  bounds: LatLngBoundsTuple,
  ratio: number = MAX_BOUNDS_PAD,
): LatLngBoundsTuple {
  const [[south, west], [north, east]] = bounds
  const latPad = (north - south) * ratio
  const lngPad = (east - west) * ratio
  return [
    [south - latPad, west - lngPad],
    [north + latPad, east + lngPad],
  ]
}
