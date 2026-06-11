import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log, dumpLogs } from './log'

/**
 * dumpLogs() output ships verbatim in every bug report (report.ts attaches the
 * last 4000 chars), so its formatting and the ring-buffer bounds are contract,
 * not cosmetics. The buffer is module-level state shared across this file, so
 * tests assert on the TAIL of the dump (and the flood test runs last).
 */

beforeEach(() => {
  // emit() mirrors every entry to the console — keep test output quiet.
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const lastLine = () => {
  const lines = dumpLogs().split('\n')
  return lines[lines.length - 1]
}

describe('dumpLogs formatting', () => {
  it('formats an entry as "<ISO timestamp> [level] scope: msg"', () => {
    log.info('Test', 'hello there')
    expect(lastLine()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[info\] Test: hello there$/,
    )
  })

  it('serializes structured data as JSON and passes strings through', () => {
    log.warn('Test', 'with data', { round: 3, score: 87 })
    expect(lastLine()).toContain(
      '[warn] Test: with data {"round":3,"score":87}',
    )
    log.error('Test', 'string data', 'plain text')
    expect(lastLine()).toContain('[error] Test: string data plain text')
  })

  it('tolerates unserializable data (circular) via the String() fallback', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    log.info('Test', 'circular', circular)
    expect(lastLine()).toContain('[info] Test: circular [object Object]')
  })

  it('drops debug entries when debug mode is off (non-browser default)', () => {
    log.debug('Test', 'should-be-invisible')
    expect(dumpLogs()).not.toContain('should-be-invisible')
  })
})

describe('ring buffer bounds', () => {
  it('caps the buffer at 300 entries, dropping the oldest', () => {
    for (let i = 0; i < 350; i++) {
      log.info('Flood', `entry ${String(i).padStart(3, '0')}`)
    }
    const lines = dumpLogs().split('\n')
    expect(lines.length).toBe(300)
    expect(lines[lines.length - 1]).toContain('entry 349')
    expect(dumpLogs()).not.toContain('entry 049') // 350-300=50 oldest dropped
    expect(dumpLogs()).toContain('entry 050')
  })
})
