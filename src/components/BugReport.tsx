/**
 * BugReport — type what went wrong, hit send. If a bug endpoint is configured
 * (VITE_BUG_ENDPOINT → the worker/ function) it files a GitHub issue directly;
 * otherwise it opens a prefilled GitHub issue page with your text.
 */

import { useState, type CSSProperties } from 'react'
import { submitBugReport, type ReportContext } from '../lib/report'
import { log } from '../lib/log'

type Status = 'idle' | 'sending' | 'done' | 'error'

export function BugReport({
  onClose,
  context,
}: {
  onClose: () => void
  context: ReportContext
}) {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  async function send() {
    if (!message.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await submitBugReport(message, context)
      if (res.ok) {
        setResultUrl(res.url ?? null)
        setStatus('done')
      } else if (res.fallbackUrl) {
        // No backend configured — hand off to the prefilled GitHub issue page.
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
            Browser/page details are attached automatically.
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
          {status === 'error' && (
            <p style={{ color: '#e74c3c' }}>
              Couldn't send — please try again in a moment.
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
