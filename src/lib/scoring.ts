/**
 * Distance + scoring for a single round.
 *
 * Scoring is on a 0–100 scale per round (so a perfect 5-round day = 500):
 *  - within PERFECT_RADIUS_M of the truth → 100 (you basically nailed it)
 *  - linear falloff from there
 *  - 0 once you're ZERO_DISTANCE_M or more away
 *
 * These constants are tunable after playtesting — see docs/PLAN.md §scoring.
 */

import type { Guess, Location } from '../types'

/** Max points for one round (0–100 scale). A perfect 5-round day = 500. */
export const MAX_ROUND_SCORE = 100

/** Within this distance you get full marks. */
export const PERFECT_RADIUS_M = 100

/** At/beyond this distance the round scores 0. */
export const ZERO_DISTANCE_M = 3000

const EARTH_RADIUS_M = 6_371_000

/** Great-circle (haversine) distance between two lat/lng points, in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Map a distance (meters) to an integer score in [0, MAX_ROUND_SCORE] with a
 * linear falloff between PERFECT_RADIUS_M and ZERO_DISTANCE_M.
 */
export function scoreForDistance(distanceMeters: number): number {
  if (distanceMeters <= PERFECT_RADIUS_M) return MAX_ROUND_SCORE
  if (distanceMeters >= ZERO_DISTANCE_M) return 0
  const frac =
    (ZERO_DISTANCE_M - distanceMeters) / (ZERO_DISTANCE_M - PERFECT_RADIUS_M)
  return Math.round(MAX_ROUND_SCORE * frac)
}

/** Convenience: score a guess against a location, returning distance + score. */
export function scoreGuess(
  location: Location,
  guess: Guess,
): { distanceMeters: number; score: number } {
  const distanceMeters = haversineMeters(location, guess)
  return { distanceMeters, score: scoreForDistance(distanceMeters) }
}

/** Human-friendly distance, e.g. "180 m" or "2.4 km". */
export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`
}
