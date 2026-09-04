/**
 * Satellite tile layer shared by every Leaflet map in the app (MapGuess for the
 * rounds, RecapMap for the end-of-day recap). Free by default:
 *  - Esri World Imagery (no key), native max zoom ~19. Attribution required
 *    (rendered by Leaflet's attribution control).
 *  - If VITE_MAPBOX_TOKEN is set: Mapbox Satellite (sharper, zoom to ~22).
 * See docs/PLAN.md §6–7.
 */

import L from 'leaflet'
import { log } from './log'

const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

export function makeTileLayer(): L.TileLayer {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  log.debug('tiles', `tile provider: ${token ? 'mapbox' : 'esri'}`)
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
