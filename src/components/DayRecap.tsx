/**
 * DayRecap — "Learn about today's locations": the end-of-day screen that shows
 * WHERE every guess landed (RecapMap: all five rounds on one satellite map) and
 * WHY each place matters (a short blurb per location, with "read more" links).
 *
 * Blurbs come from the per-city sidecar `public/blurbs.<city>.json`, loaded
 * lazily when this screen opens (src/lib/blurbs.ts). Each card shows a one-line
 * descriptor (what kind of place) and/or the story; a location nobody has
 * researched yet shows the rollout placeholder — the map and the
 * score/distance facts work for every location regardless, so the feature is
 * useful from day one and gets richer as blurbs are added. Tapping a card frames that round on
 * the map. Reached from the results screen; "back" returns there.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { RoundResult } from '../types'
import { formatDistance, scoreEmoji } from '../lib/scoring'
import {
  categoryLabel,
  fetchBlurbs,
  resolveBlurb,
  type BlurbsFile,
} from '../lib/blurbs'
import { log } from '../lib/log'
import { RecapMap } from './RecapMap'

export interface DayRecapProps {
  cityId: string
  cityShort: string
  dateKey: string
  /** City play bounds, for the recap map's widest view. */
  bounds: [[number, number], [number, number]]
  results: RoundResult[]
  onClose: () => void
}

type BlurbsState =
  { phase: 'loading' } | { phase: 'ready'; file: BlurbsFile | null }

export function DayRecap({
  cityId,
  cityShort,
  dateKey,
  bounds,
  results,
  onClose,
}: DayRecapProps) {
  const [blurbs, setBlurbs] = useState<BlurbsState>({ phase: 'loading' })
  const [focus, setFocus] = useState<number | null>(null)
  const mapWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let live = true
    // fetchBlurbs never throws: a missing/broken sidecar just means placeholders.
    fetchBlurbs(cityId).then((file) => {
      if (live) setBlurbs({ phase: 'ready', file })
    })
    return () => {
      live = false
    }
    // One load per open; the city is fixed for a mounted recap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function focusRound(i: number) {
    const next = focus === i ? null : i
    log.debug('DayRecap', 'focus round', { round: next })
    setFocus(next)
    // On a phone the map sits above the cards, so bring it back into view when a
    // card is tapped (optional chaining: jsdom has no scrollIntoView).
    if (next !== null)
      mapWrapRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      })
  }

  return (
    <section style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <h2 style={{ marginBottom: 4 }}>📍 Today’s locations</h2>
        <button onClick={onClose} style={linkButton}>
          ← back
        </button>
      </div>
      <p style={{ marginTop: 0, opacity: 0.7, fontSize: 14 }}>
        {cityShort} · {dateKey} · <span style={{ color: '#2ecc71' }}>●</span>{' '}
        real spot · <span style={{ color: '#f4b400' }}>●</span> your guess · tap
        a card to zoom in
      </p>

      <div ref={mapWrapRef} style={{ scrollMarginTop: 8 }}>
        <RecapMap bounds={bounds} results={results} focus={focus} />
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {results.map((r, i) => {
          const blurb =
            blurbs.phase === 'ready'
              ? resolveBlurb(blurbs.file, r.location.id)
              : null
          const focused = focus === i
          return (
            <li key={r.location.id} style={{ marginBottom: 10 }}>
              <article
                onClick={() => focusRound(i)}
                style={{
                  ...card,
                  borderColor: focused ? '#2ecc71' : 'rgba(255,255,255,0.12)',
                  background: focused
                    ? 'rgba(46,204,113,0.10)'
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                <div
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                >
                  <span style={badge}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>
                      {r.location.name}
                    </h3>
                    <p
                      style={{
                        margin: '2px 0 6px',
                        fontSize: 13,
                        opacity: 0.7,
                      }}
                    >
                      {categoryLabel(r.location.category)} ·{' '}
                      {scoreEmoji(r.score)} {formatDistance(r.distanceMeters)} ·{' '}
                      {r.score.toLocaleString('en-US')} pts
                    </p>
                    {blurb === null ? (
                      <p style={{ margin: 0, opacity: 0.5, fontSize: 14 }}>
                        Loading…
                      </p>
                    ) : blurb.placeholder ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontStyle: 'italic',
                          opacity: 0.55,
                        }}
                      >
                        {blurb.text}
                      </p>
                    ) : (
                      <>
                        {blurb.descriptor && (
                          <p
                            style={{
                              margin: '0 0 4px',
                              fontSize: 14,
                              fontWeight: 600,
                              opacity: 0.85,
                            }}
                          >
                            {blurb.descriptor}
                          </p>
                        )}
                        {blurb.text && (
                          <p
                            style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}
                          >
                            {blurb.text}
                          </p>
                        )}
                        {blurb.sources.length > 0 && (
                          <p
                            style={{
                              margin: '6px 0 0',
                              fontSize: 12,
                              opacity: 0.7,
                            }}
                          >
                            Read more:{' '}
                            {blurb.sources.map((s, k) => (
                              <span key={s}>
                                {k > 0 && ' · '}
                                <a
                                  href={s}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ color: '#7fb2ff' }}
                                >
                                  {hostOf(s)}
                                </a>
                              </span>
                            ))}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Display text for a source link: its host, e.g. "en.wikipedia.org". */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const card: CSSProperties = {
  border: '1px solid',
  borderRadius: 10,
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'background 120ms, border-color 120ms',
}

const badge: CSSProperties = {
  flex: '0 0 auto',
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: '#2ecc71',
  color: '#0f1720',
  fontWeight: 700,
  fontSize: 14,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const linkButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7fb2ff',
  cursor: 'pointer',
  font: 'inherit',
  whiteSpace: 'nowrap',
}
