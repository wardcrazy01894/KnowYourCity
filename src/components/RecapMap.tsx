/**
 * RecapMap — a read-only satellite map showing ALL of the day's rounds at once:
 * each real spot as a numbered green marker (play order), the player's guess as
 * an amber pin, a dashed line between them, and the footprint polygon where one
 * exists. Shown on the end-of-day recap (DayRecap), never during play.
 *
 * Same raw-Leaflet-via-refs approach as MapGuess (no react-leaflet). Every
 * layer lives in ONE feature group that is rebuilt whenever `results` change
 * and removed on unmount, so nothing can leak across mounts. `focus` frames a
 * single round (tapping its card); null frames all of them.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { RoundResult } from '../types'
import { log } from '../lib/log'
import { padBounds } from '../lib/mapBounds'
import { makeTileLayer } from '../lib/tiles'

export interface RecapMapProps {
  /** City play bounds [[south, west], [north, east]] — the widest allowed view. */
  bounds: [[number, number], [number, number]]
  /** The day's rounds in play order. */
  results: RoundResult[]
  /** Index of the round to frame, or null/undefined to frame the whole day. */
  focus?: number | null
}

/** Numbered marker for the real spot — a div icon so the label is crisp text. */
function numberedIcon(n: number): L.DivIcon {
  // `html` is injected as innerHTML — `n` is a number we generate, never data.
  return L.divIcon({
    className: 'recap-marker-wrap',
    html: `<span class="recap-marker">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

/** Bounds covering one round's guess, truth marker, and footprint polygon. */
function roundBounds(r: RoundResult): L.LatLngBounds {
  const b = L.latLngBounds(
    [r.location.lat, r.location.lng],
    [r.guess.lat, r.guess.lng],
  )
  for (const p of r.location.polygon ?? []) b.extend(p as L.LatLngExpression)
  return b
}

export function RecapMap({ bounds, results, focus }: RecapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.FeatureGroup | null>(null)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      maxBounds: padBounds(bounds),
      maxBoundsViscosity: 1,
      zoomControl: true,
    })
    const tiles = makeTileLayer()
    tiles.on('tileerror', () => log.debug('RecapMap', 'tile failed to load'))
    tiles.addTo(map)
    map.fitBounds(bounds)
    const lockMinZoom = () => map.setMinZoom(map.getBoundsZoom(bounds))
    lockMinZoom()
    map.on('resize', lockMinZoom)
    mapRef.current = map
    log.debug('RecapMap', 'map initialized')
    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
    // bounds is constant for a mounted recap; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (Re)draw every round's layers as one group.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current?.remove()
    const group = L.featureGroup()
    results.forEach((r, i) => {
      const truth: L.LatLngExpression = [r.location.lat, r.location.lng]
      const guess: L.LatLngExpression = [r.guess.lat, r.guess.lng]
      if (r.location.polygon?.length) {
        L.polygon(r.location.polygon as L.LatLngExpression[], {
          color: '#2ecc71',
          weight: 2,
          fillColor: '#2ecc71',
          fillOpacity: 0.15,
        }).addTo(group)
      }
      L.polyline([guess, truth], {
        color: '#f4b400',
        weight: 2,
        dashArray: '6 6',
      }).addTo(group)
      L.circleMarker(guess, {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f4b400',
        fillOpacity: 1,
      }).addTo(group)
      // Text node, not a string: Leaflet's bindTooltip(string) sets innerHTML,
      // and a location name is data (see MapGuess for the same guard).
      const label = document.createElement('span')
      label.textContent = r.location.name
      L.marker(truth, { icon: numberedIcon(i + 1), keyboard: false })
        .bindTooltip(label, { direction: 'top', offset: [0, -12] })
        .addTo(group)
    })
    group.addTo(map)
    layersRef.current = group
    return () => {
      group.remove()
      if (layersRef.current === group) layersRef.current = null
    }
  }, [results])

  // Frame one round or the whole day.
  useEffect(() => {
    const map = mapRef.current
    if (!map || results.length === 0) return
    const target =
      focus != null && results[focus]
        ? roundBounds(results[focus])
        : results.map(roundBounds).reduce((acc, b) => acc.extend(b))
    map.fitBounds(target.pad(0.25), { maxZoom: 17 })
  }, [results, focus])

  return <div className="map-container recap-map" ref={containerRef} />
}
