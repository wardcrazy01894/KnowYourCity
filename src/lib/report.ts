/**
 * Bug reporting.
 *
 * The app is static, so it can't hold a GitHub token. Two paths:
 *  1. If `VITE_BUG_ENDPOINT` is set, `submitBugReport` POSTs the report to that
 *     serverless function (see `worker/`), which creates a GitHub issue using a
 *     token kept server-side. The user just types and hits send.
 *  2. Otherwise it falls back to opening a PREFILLED GitHub "new issue" page
 *     (`bugReportUrl`) with the user's text — works today, needs a GH account.
 */

import { dumpLogs } from './log'

export const REPO_URL = 'https://github.com/wardcrazy01894/KnowYourCity'

export interface ReportContext {
  city?: string
  date?: string
}

/**
 * Prefill text for the bug-report form when someone wants a place ADDED to the
 * game (e.g. from the "is a place in the game?" search). Names the spot when we
 * have it so the request is actionable.
 */
export function addLocationRequestMessage(
  name: string,
  cityShort: string,
): string {
  // Strip embedded double-quotes so they can't nest inside the wrapping quotes.
  const place = name.replace(/"/g, '').trim()
  return place
    ? `Please add "${place}" to the ${cityShort} game.`
    : `I'd like to request a place be added to the ${cityShort} game: `
}

/** Prefilled GitHub new-issue URL (fallback path / no backend). */
export function bugReportUrl(ctx: ReportContext = {}, message = ''): string {
  const href = typeof location !== 'undefined' ? location.href : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const title = '[bug] ' + (message.split('\n')[0] || '').slice(0, 80)
  const body = [
    '**What happened?**',
    '',
    message || '',
    '',
    '---',
    `City: ${ctx.city ?? '?'}`,
    `Puzzle: ${ctx.date ?? '?'}`,
    `URL: ${href}`,
    `Browser: ${ua}`,
    '',
    '_Tip: run `kycDumpLogs()` in the browser console (F12) and paste the output._',
  ].join('\n')
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(
    title,
  )}&body=${encodeURIComponent(body)}`
}

interface SubmitOptions {
  /** Attach recent session logs (default true). */
  includeLogs?: boolean
  /** Cloudflare Turnstile token, when the widget is enabled. */
  turnstileToken?: string
}

/** The JSON body POSTed to the bug endpoint. Pure + testable. */
export function buildReportPayload(
  message: string,
  ctx: ReportContext = {},
  opts: SubmitOptions = {},
) {
  return {
    message: message.trim(),
    context: {
      city: ctx.city ?? null,
      date: ctx.date ?? null,
      url: typeof location !== 'undefined' ? location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    },
    logs: opts.includeLogs === false ? '' : dumpLogs().slice(-4000),
    turnstileToken: opts.turnstileToken,
  }
}

interface SubmitResult {
  ok: boolean
  /** Created issue URL when the backend handled it. */
  url?: string
  /** Prefilled issue URL to open when there's no backend. */
  fallbackUrl?: string
}

/**
 * Submit a bug report. With a configured endpoint, creates the issue server-side
 * and resolves `{ ok: true, url }`. Without one, resolves `{ ok: false,
 * fallbackUrl }` so the UI can open the prefilled issue page instead.
 */
export async function submitBugReport(
  message: string,
  ctx: ReportContext = {},
  opts: SubmitOptions = {},
): Promise<SubmitResult> {
  const endpoint = import.meta.env.VITE_BUG_ENDPOINT
  if (!endpoint) return { ok: false, fallbackUrl: bugReportUrl(ctx, message) }
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildReportPayload(message, ctx, opts)),
  })
  if (!r.ok) {
    // Carry the server's reason (rate limited / forbidden origin / verification
    // failed), not just the status — BugReport.tsx logs this error, so without
    // the body a "couldn't send a bug report" report can't be diagnosed.
    const detail = await r.text().catch(() => '')
    throw new Error(
      `Bug endpoint HTTP ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }
  const data = (await r.json().catch(() => ({}))) as { url?: string }
  return { ok: true, url: data.url }
}
