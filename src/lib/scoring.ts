/**
 * Distance + scoring for a single round.
 *
 * ── Why not GeoGuessr's formula? ─────────────────────────────────────────────
 * GeoGuessr scores on a planet-wide scale (5000 pts, decay constant ~2000 km),
 * so at city scale (max realistic error ~15 km) every guess would peg near max.
 * We retune for a single city: full marks if you're basically on the building,
 * a smooth exponential falloff over the city, and zero once you're absurdly off.
 *
 * Tunables below are first-draft and meant to be adjusted after playtesting —
 * see docs/QUESTIONS-FOR-ALEX.md (difficulty tuning).
 */

import type { Guess, Location } from '../types'

/** Max points for one round (so a perfect 5-round day = 25,000). */
export const MAX_ROUND_SCORE = 5000

/** Within this distance you get full marks (you basically nailed it). */
export const PERFECT_RADIUS_M = 75

/** Beyond this distance the round scores 0. */
export const ZERO_DISTANCE_M = 12_000

/** Controls falloff steepness between PERFECT_RADIUS_M and ZERO_DISTANCE_M. */
export const DECAY_SCALE_M = 1_500

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
 * Map a distance (meters) to an integer score in [0, MAX_ROUND_SCORE].
 *  - distance <= PERFECT_RADIUS_M       → MAX_ROUND_SCORE
 *  - distance >= ZERO_DISTANCE_M        → 0
 *  - between                            → exponential decay
 */
export function scoreForDistance(distanceMeters: number): number {
  if (distanceMeters <= PERFECT_RADIUS_M) return MAX_ROUND_SCORE
  if (distanceMeters >= ZERO_DISTANCE_M) return 0
  const over = distanceMeters - PERFECT_RADIUS_M
  const raw = MAX_ROUND_SCORE * Math.exp(-over / DECAY_SCALE_M)
  return Math.round(raw)
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
