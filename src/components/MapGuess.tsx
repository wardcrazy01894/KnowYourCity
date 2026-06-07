/**
 * MapGuess — the interactive satellite map for one round.
 *
 * Uses raw Leaflet (via refs) rather than react-leaflet to keep deps light and
 * avoid the default-marker-icon bundler breakage — we draw guess/truth as
 * circle markers and connect them with a polyline on reveal.
 *
 * Tiles (free):
 *  - Default: Esri World Imagery (no key), native max zoom ~19. Attribution
 *    required (rendered by Leaflet's attribution control).
 *  - If VITE_MAPBOX_TOKEN is set: Mapbox Satellite (sharper, zoom to ~22).
 *
 * The map is locked to `bounds` (maxBounds + viscosity) so players can't pan
 * away from St. Pete.
 *
 * Anti-cheat note: answers live in the bundled JSON and are readable via
 * devtools. For a friends game that's acceptable and intentional.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Guess, Location } from '../types'
import { log } from '../lib/log'

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
  /** Change this (e.g. the round index) to re-frame the map to full bounds. */
  resetViewKey?: number
}

const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

function makeTileLayer(): L.TileLayer {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  log.debug('MapGuess', `tile provider: ${token ? 'mapbox' : 'esri'}`)
  if (token) {
    return L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
      {
        attribution:
          '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; Maxar',
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 22,
      },
    )
  }
  return L.tileLayer(ESRI_URL, {
    attribution: ESRI_ATTR,
    maxNativeZoom: 19,
    maxZoom: 19,
  })
}

export function MapGuess({
  bounds,
  guess,
  onGuessChange,
  reveal,
  locked,
  resetViewKey,
}: MapGuessProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const guessMarkerRef = useRef<L.CircleMarker | null>(null)
  const truthMarkerRef = useRef<L.CircleMarker | null>(null)
  const lineRef = useRef<L.Polyline | null>(null)
  // Keep the latest callback/locked without re-binding the map click handler.
  const onGuessRef = useRef(onGuessChange)
  const lockedRef = useRef(locked)
  onGuessRef.current = onGuessChange
  lockedRef.current = locked

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      maxBounds: bounds,
      maxBoundsViscosity: 1,
      zoomControl: true,
    })
    const tiles = makeTileLayer()
    tiles.on('tileerror', () => log.debug('MapGuess', 'tile failed to load'))
    tiles.addTo(map)
    map.fitBounds(bounds)
    // The initial fit-to-bounds is the WIDEST allowed view — lock minZoom to it
    // so players can't zoom out past the city box. (Recompute on resize so the
    // floor stays correct across viewport sizes.)
    const lockMinZoom = () => map.setMinZoom(map.getBoundsZoom(bounds))
    lockMinZoom()
    map.on('resize', lockMinZoom)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (lockedRef.current) return
      log.debug('MapGuess', 'guess placed', {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      })
      onGuessRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    mapRef.current = map
    log.debug('MapGuess', 'map initialized')
    return () => {
      map.remove()
      mapRef.current = null
    }
    // bounds is effectively constant for the game; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync the guess marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!guess) {
      guessMarkerRef.current?.remove()
      guessMarkerRef.current = null
      return
    }
    const latlng: L.LatLngExpression = [guess.lat, guess.lng]
    if (guessMarkerRef.current) {
      guessMarkerRef.current.setLatLng(latlng)
    } else {
      guessMarkerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f4b400',
        fillOpacity: 1,
      }).addTo(map)
    }
  }, [guess])

  // Sync the reveal (truth marker + connecting line + fit both in view).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    truthMarkerRef.current?.remove()
    truthMarkerRef.current = null
    lineRef.current?.remove()
    lineRef.current = null
    if (!reveal) return

    const truth: L.LatLngExpression = [reveal.location.lat, reveal.location.lng]
    // Use a text node, NOT a raw string — Leaflet's bindTooltip(string) assigns
    // innerHTML, which would execute HTML in a location name (stored XSS). A
    // span + textContent is safe regardless of the name's content.
    const label = document.createElement('span')
    label.textContent = reveal.location.name
    truthMarkerRef.current = L.circleMarker(truth, {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2ecc71',
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(label, { permanent: true, direction: 'top' })
      .openTooltip()

    if (guess) {
      lineRef.current = L.polyline([[guess.lat, guess.lng], truth], {
        color: '#f4b400',
        weight: 2,
        dashArray: '6 6',
      }).addTo(map)
      map.fitBounds(L.latLngBounds([guess.lat, guess.lng], truth).pad(0.4), {
        maxZoom: 17,
      })
    } else {
      map.setView(truth, 15)
    }
  }, [reveal, guess])

  // Re-frame to the full play area at the start of each new round.
  useEffect(() => {
    const map = mapRef.current
    if (!map || reveal) return
    map.fitBounds(bounds)
    // Only react to the round changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetViewKey])

  return <div className="map-container" ref={containerRef} />
}
