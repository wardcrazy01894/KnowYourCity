/**
 * BugReport — type what went wrong, hit send. If a bug endpoint is configured
 * (VITE_BUG_ENDPOINT → the worker/ function) it files a GitHub issue directly;
 * otherwise it opens a prefilled GitHub issue page with your text.
 *
 * If VITE_TURNSTILE_SITEKEY is set, a Cloudflare Turnstile bot check is shown and
 * its token is sent (the worker verifies it). Logs are attached only if the user
 * leaves the checkbox on — and the report becomes a (public, by default) issue,
 * so the form warns against pasting sensitive info.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { submitBugReport, type ReportContext } from '../lib/report'
import { log } from '../lib/log'

type Status = 'idle' | 'sending' | 'done' | 'error'

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITEKEY

interface TurnstileApi {
  render: (el: HTMLElement, opts: { sitekey: string }) => string
  remove: (id: string) => void
  reset: (id?: string) => void
  getResponse: (id?: string) => string | undefined
}
function getTurnstileToken(widgetId?: string): string | undefined {
  const w = window as unknown as { turnstile?: TurnstileApi }
  return w.turnstile?.getResponse(widgetId)
}

/**
 * Reset the Turnstile widget so a retry gets a FRESH token. Turnstile tokens are
 * single-use, so after a failed send the consumed token must be cleared —
 * otherwise the next attempt re-submits it and the worker's siteverify rejects it
 * until the widget auto-refreshes (~minutes). Best-effort: a no-op if Turnstile
 * isn't loaded, and never throws.
 */
export function resetTurnstile(widgetId?: string): void {
  const w = window as unknown as { turnstile?: TurnstileApi }
  try {
    w.turnstile?.reset(widgetId)
  } catch {
    // Widget may already be gone / not yet rendered — nothing to reset.
  }
}

export function BugReport({
  onClose,
  context,
  initialMessage = '',
}: {
  onClose: () => void
  context: ReportContext
  /** Prefill the textarea (e.g. a "please add this place" request). */
  initialMessage?: string
}) {
  const [message, setMessage] = useState(initialMessage)
  const [includeLogs, setIncludeLogs] = useState(true)
  const [status, setStatus] = useState<Status>('idle')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)

  // Render the Turnstile widget explicitly each time the form mounts, and
  // remove it on unmount. Turnstile's implicit mode only auto-renders
  // `.cf-turnstile` elements that exist when the script first loads; in this
  // SPA the form is unmounted on close and a fresh container is mounted on
  // reopen, so without an explicit render the second open shows no widget
  // until a full page refresh. We load the API in `render=explicit` mode so
  // nothing auto-renders and we fully control the lifecycle.
  useEffect(() => {
    if (!TURNSTILE_KEY) return
    const sitekey: string = TURNSTILE_KEY
    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | undefined

    const scriptId = 'cf-turnstile-script'
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId
      s.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    }

    // Render once the API is available and the container is in the DOM.
    function tryRender(): boolean {
      if (cancelled) return true
      const w = window as unknown as { turnstile?: TurnstileApi }
      if (!w.turnstile || !widgetRef.current) return false
      if (widgetIdRef.current === undefined) {
        widgetIdRef.current = w.turnstile.render(widgetRef.current, {
          sitekey,
        })
      }
      return true
    }

    if (!tryRender()) {
      pollTimer = setInterval(() => {
        if (tryRender() && pollTimer) clearInterval(pollTimer)
      }, 150)
    }

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      const w = window as unknown as { turnstile?: TurnstileApi }
      if (widgetIdRef.current !== undefined) {
        try {
          w.turnstile?.remove(widgetIdRef.current)
        } catch {
          // Widget may already be gone; nothing to clean up.
        }
        widgetIdRef.current = undefined
      }
    }
  }, [])

  async function send() {
    if (!message.trim() || status === 'sending') return
    const turnstileToken = TURNSTILE_KEY
      ? getTurnstileToken(widgetIdRef.current)
      : undefined
    if (TURNSTILE_KEY && !turnstileToken) {
      setStatus('error')
      return
    }
    setStatus('sending')
    try {
      const res = await submitBugReport(message, context, {
        includeLogs,
        turnstileToken,
      })
      if (res.ok) {
        // Only render the link if it's actually a github.com issue URL.
        const safe =
          res.url && res.url.startsWith('https://github.com/') ? res.url : null
        setResultUrl(safe)
        setStatus('done')
      } else if (res.fallbackUrl) {
        log.info('BugReport', 'no endpoint; opening prefilled issue')
        window.open(res.fallbackUrl, '_blank', 'noopener')
        setStatus('done')
      } else {
        // Worker rejected the report (e.g. consumed/invalid token, rate limit).
        // Reset Turnstile so the retry gets a fresh, unconsumed token.
        if (TURNSTILE_KEY) resetTurnstile(widgetIdRef.current)
        setStatus('error')
      }
    } catch (e) {
      log.error('BugReport', 'submit failed', { error: String(e) })
      // Single-use token is now spent — reset so a retry isn't dead on arrival.
      if (TURNSTILE_KEY) resetTurnstile(widgetIdRef.current)
      setStatus('error')
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <button onClick={onClose} style={link}>
        ← back
      </button>

      <h2 style={{ margin: '8px 0 4px' }}>🐛 Report a bug</h2>

      {status === 'done' ? (
        <div>
          <p style={{ color: '#2ecc71', fontWeight: 700 }}>
            Thanks! Your report was sent.
          </p>
          {resultUrl && (
            <p>
              <a href={resultUrl} target="_blank" rel="noreferrer">
                View the issue ↗
              </a>
            </p>
          )}
          <button onClick={onClose} style={btn}>
            Done
          </button>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0, opacity: 0.75 }}>
            Tell us what happened — what you did and what went wrong.
          </p>
          <textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="e.g. The map didn't load on round 3, just a grey box."
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              background: '#0b1118',
              color: 'var(--fg)',
              border: '1px solid #2a3543',
              font: 'inherit',
              resize: 'vertical',
            }}
          />

          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 14,
              marginTop: 8,
            }}
          >
            <input
              type="checkbox"
              checked={includeLogs}
              onChange={(e) => setIncludeLogs(e.target.checked)}
            />
            Attach diagnostic info (page, browser, recent actions) — helps
            debugging
          </label>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            Your report is sent to the project's issue tracker (may be public).
            Please don't include personal or sensitive info.
          </p>

          {TURNSTILE_KEY && <div ref={widgetRef} style={{ marginTop: 8 }} />}

          {status === 'error' && (
            <p style={{ color: '#e74c3c' }}>
              {TURNSTILE_KEY
                ? "Couldn't send — complete the check and try again."
                : "Couldn't send — please try again in a moment."}
            </p>
          )}
          <button
            onClick={send}
            disabled={!message.trim() || status === 'sending'}
            style={{ ...btn, opacity: message.trim() ? 1 : 0.5 }}
          >
            {status === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </>
      )}
    </main>
  )
}

const link: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7fb2ff',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
}
const btn: CSSProperties = {
  marginTop: 12,
  padding: '10px 16px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#f4b400',
  color: '#0f1720',
  cursor: 'pointer',
}
