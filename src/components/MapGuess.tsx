/**
 * MapGuess — the interactive satellite map for one round.
 *
 * Responsibilities:
 *  - Render a Leaflet map with a FREE satellite tile layer.
 *      • Default: Esri World Imagery (no key). Attribution REQUIRED:
 *        'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the
 *         GIS User Community'. Esri World Imagery native max zoom ≈ 19;
 *        set maxNativeZoom={19} and maxZoom={19} (optionally allow overzoom to
 *        20 with `maxNativeZoom` so Leaflet upscales rather than showing blanks).
 *      • If import.meta.env.VITE_MAPBOX_TOKEN is set, use Mapbox Satellite
 *        instead (sharper, zoom to 22). See .env.example.
 *  - Constrain the view to the St. Pete area via `maxBounds` so players can't
 *    pan to the other side of the planet (bounds come from props; see PLAN.md).
 *  - Let the player drop/move a single pin (one Guess) before submitting.
 *  - In `revealed` mode, also render the true location marker and a polyline
 *    between guess and truth, with the distance labelled.
 *
 * Anti-cheat note: the answer coordinates live in the bundled JSON and are
 * readable via devtools. For a friends game this is acceptable and intentional
 * — do NOT add obfuscation theater. See docs/PLAN.md §"Anti-cheat".
 */

import type { Guess, Location } from '../types'

export interface MapGuessProps {
  /** Bounding box the map is locked to, [[south, west], [north, east]]. */
  bounds: [[number, number], [number, number]]
  /** Current guess pin, or null if the player hasn't placed one yet. */
  guess: Guess | null
  onGuessChange: (g: Guess) => void
  /** When set, the round is revealed: show truth marker + distance line. */
  reveal?: { location: Location; distanceMeters: number } | null
  /** Disable interaction after submit. */
  locked?: boolean
}

export function MapGuess(_props: MapGuessProps) {
  // TODO: initialise Leaflet in a useEffect/ref, add the satellite TileLayer
  // chosen above, wire click→onGuessChange, render markers/polyline on reveal.
  return <div className="map-container" data-stub="MapGuess" />
}
