/**
 * Bug reporting — no backend, so "Report a bug" opens a prefilled GitHub issue
 * on the public repo with useful context (city, puzzle date, URL, browser) and a
 * nudge to paste `kylDumpLogs()` output. Players need a GitHub account to submit.
 */

export const REPO_URL = 'https://github.com/wardcrazy01894/KnowYourLocals'

export function bugReportUrl(
  ctx: { city?: string; date?: string } = {},
): string {
  const href = typeof location !== 'undefined' ? location.href : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const title = '[bug] '
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect?**',
    '',
    '',
    '---',
    `City: ${ctx.city ?? '?'}`,
    `Puzzle: ${ctx.date ?? '?'}`,
    `URL: ${href}`,
    `Browser: ${ua}`,
    '',
    '_Tip: run `kylDumpLogs()` in the browser console (F12) and paste the output here._',
  ].join('\n')
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(
    title,
  )}&body=${encodeURIComponent(body)}`
}
