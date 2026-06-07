/**
 * Tiny logging utility for KnowYourLocals.
 *
 * Goals:
 *  - Readable console output prefixed with `[KYL]` and a scope.
 *  - An in-memory ring buffer of the last N entries so a whole session can be
 *    dumped and pasted to a developer when something goes wrong.
 *  - Global hooks (in dev tools): `window.kylDumpLogs()` prints + copies the
 *    buffer; `window.__KYL_LOGS__` is the raw array.
 *  - `debug` level is quiet unless enabled (`?debug` in the URL, or
 *    localStorage `kyl:debug` = '1'), so normal play isn't noisy.
 *  - Safe to import in non-browser contexts (tests): guards `window`.
 *
 * Usage:  import { log } from './lib/log'
 *         log.info('Game', 'round submitted', { round, distanceMeters, score })
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  t: string
  level: LogLevel
  scope: string
  msg: string
  data?: unknown
}

const MAX_ENTRIES = 300
const buffer: LogEntry[] = []
const hasWindow = typeof window !== 'undefined'

function debugEnabled(): boolean {
  if (!hasWindow) return false
  try {
    if (new URLSearchParams(window.location.search).has('debug')) return true
    return window.localStorage.getItem('kyl:debug') === '1'
  } catch {
    return false
  }
}

function serialize(data: unknown): string {
  if (data === undefined) return ''
  try {
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function emit(level: LogLevel, scope: string, msg: string, data?: unknown) {
  if (level === 'debug' && !debugEnabled()) return
  const entry: LogEntry = {
    t: new Date().toISOString(),
    level,
    scope,
    msg,
    data,
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.shift()

  const line = `[KYL ${level.toUpperCase()}] ${scope}: ${msg}`
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'debug'
          ? console.debug
          : console.info
  if (data !== undefined) fn(line, data)
  else fn(line)

  if (hasWindow) {
    ;(window as unknown as { __KYL_LOGS__?: LogEntry[] }).__KYL_LOGS__ = buffer
  }
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) =>
    emit('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) =>
    emit('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) =>
    emit('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) =>
    emit('error', scope, msg, data),
}

/** Returns the buffered log as a single string (for copy/paste to a dev). */
export function dumpLogs(): string {
  return buffer
    .map(
      (e) =>
        `${e.t} [${e.level}] ${e.scope}: ${e.msg}${
          e.data !== undefined ? ' ' + serialize(e.data) : ''
        }`,
    )
    .join('\n')
}

/**
 * Install global helpers + uncaught-error capture. Call once at startup.
 * Adds window.kylDumpLogs() (prints, copies to clipboard, returns the text).
 */
export function installLogging(appVersion: string): void {
  if (!hasWindow) return
  const w = window as unknown as {
    kylDumpLogs?: () => string
    __KYL_LOGS__?: LogEntry[]
  }
  w.kylDumpLogs = () => {
    const text = dumpLogs()
    console.log(text)
    try {
      void navigator.clipboard?.writeText(text)
    } catch {
      /* clipboard may be unavailable */
    }
    return text
  }
  window.addEventListener('error', (e) => {
    log.error('window', 'uncaught error', {
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    log.error('window', 'unhandled promise rejection', {
      reason: String((e as PromiseRejectionEvent).reason),
    })
  })
  log.info('App', `KnowYourLocals v${appVersion} starting`, {
    debug: debugEnabled(),
    ua: navigator.userAgent,
  })
}
