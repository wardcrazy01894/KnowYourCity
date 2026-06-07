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
  getResponse: (id?: string) => string | undefined
}
function getTurnstileToken(): string | undefined {
  const w = window as unknown as { turnstile?: TurnstileApi }
  return w.turnstile?.getResponse()
}

export function BugReport({
  onClose,
  context,
}: {
  onClose: () => void
  context: ReportContext
}) {
  const [message, setMessage] = useState('')
  const [includeLogs, setIncludeLogs] = useState(true)
  const [status, setStatus] = useState<Status>('idle')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const widgetRef = useRef<HTMLDivElement | null>(null)

  // Load the Turnstile widget script once, when a site key is configured.
  useEffect(() => {
    if (!TURNSTILE_KEY) return
    const id = 'cf-turnstile-script'
    if (document.getElementById(id)) return
    const s = document.createElement('script')
    s.id = id
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    s.async = true
    s.defer = true
    document.head.appendChild(s)
  }, [])

  async function send() {
    if (!message.trim() || status === 'sending') return
    const turnstileToken = TURNSTILE_KEY ? getTurnstileToken() : undefined
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
      }
    } catch (e) {
      log.error('BugReport', 'submit failed', { error: String(e) })
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

          {TURNSTILE_KEY && (
            <div
              ref={widgetRef}
              className="cf-turnstile"
              data-sitekey={TURNSTILE_KEY}
              style={{ marginTop: 8 }}
            />
          )}

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
