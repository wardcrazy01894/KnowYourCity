/**
 * DatasetSearch — "is my business in the game?" Look up whether a place is in a
 * city's dataset, with an autocomplete list of matches.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { Location, LocationsFile } from '../types'
import { CITIES, cityDataUrl, DEFAULT_CITY_ID } from '../lib/cities'
import { searchLocations, isIncluded } from '../lib/search'
import { addLocationRequestMessage } from '../lib/report'
import { log } from '../lib/log'

export function DatasetSearch({
  onClose,
  initialCityId,
  onRequestAdd,
}: {
  onClose: () => void
  initialCityId?: string | null
  /** Open the bug-report form to request a place be added, prefilled with the
   * given request message. */
  onRequestAdd?: (prefillMessage: string) => void
}) {
  const [cityId, setCityId] = useState(initialCityId || DEFAULT_CITY_ID)
  const [locations, setLocations] = useState<Location[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    setLocations(null)
    fetch(cityDataUrl(cityId))
      .then((r) => r.json() as Promise<LocationsFile>)
      .then((f) => live && setLocations(f.locations))
      .catch((e) => {
        log.warn('DatasetSearch', 'load failed', { error: String(e) })
        if (live) setLocations([])
      })
    return () => {
      live = false
    }
  }, [cityId])

  const list = locations ?? []
  const matches = searchLocations(list, query)
  const included = query.trim().length >= 2 && isIncluded(list, query)
  const cityShort = CITIES.find((c) => c.id === cityId)?.short ?? cityId

  return (
    <main style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#7fb2ff',
          cursor: 'pointer',
          padding: 0,
          font: 'inherit',
        }}
      >
        ← back
      </button>

      <h2 style={{ margin: '8px 0 4px' }}>Is a place in the game?</h2>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Search a city's list to see if a spot is included.
        {onRequestAdd && (
          <>
            {' '}
            Don't see it?{' '}
            <button
              onClick={() =>
                onRequestAdd(addLocationRequestMessage(query, cityShort))
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7fb2ff',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Report a bug to request it
            </button>
            .
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: '#172230',
            color: 'var(--fg)',
            border: '1px solid #2a3543',
          }}
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short}
            </option>
          ))}
        </select>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. My Rich Uncle"
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            background: '#0b1118',
            color: 'var(--fg)',
            border: '1px solid #2a3543',
          }}
        />
      </div>

      <p style={{ fontSize: 13, opacity: 0.6, marginTop: 0 }}>
        {locations === null
          ? 'Loading…'
          : `${list.length} places in ${cityShort}.`}
      </p>

      {query.trim().length >= 2 && (
        <>
          {included ? (
            <p style={{ color: '#2ecc71', fontWeight: 700 }}>
              ✓ Yes — that's in the {cityShort} game!
            </p>
          ) : matches.length > 0 ? (
            <p style={{ opacity: 0.8 }}>No exact match. Did you mean:</p>
          ) : (
            <>
              <p style={{ color: '#e67e22', fontWeight: 600, marginBottom: 6 }}>
                Not in the {cityShort} list (yet).
              </p>
              {onRequestAdd && (
                <button
                  onClick={() =>
                    onRequestAdd(addLocationRequestMessage(query, cityShort))
                  }
                  style={requestBtn}
                >
                  + Request to add it
                </button>
              )}
            </>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setQuery(m.name)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: '#11202e',
                    color: 'var(--fg)',
                    border: '1px solid #1d2b3a',
                    borderRadius: 8,
                    marginBottom: 6,
                    cursor: 'pointer',
                  }}
                >
                  {m.name}{' '}
                  <span style={{ opacity: 0.5, fontSize: 12 }}>
                    · {m.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

const requestBtn: CSSProperties = {
  padding: '8px 14px',
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#f4b400',
  color: '#0f1720',
  cursor: 'pointer',
  marginBottom: 8,
}
