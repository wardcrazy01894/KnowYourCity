// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { DatasetSearch } from './DatasetSearch'
import { log } from '../lib/log'

/**
 * DOM-level test for DatasetSearch's dataset load: a failing fetch must be
 * diagnosable from the log alone — which CITY failed and the real HTTP status
 * (scan finding: a 404 used to surface as a misleading JSON-parse error with
 * no cityId in the payload).
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DatasetSearch dataset load failure', () => {
  it('logs the real HTTP status and the cityId when the dataset request fails', async () => {
    const warn = vi.spyOn(log, 'warn')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error('body is not JSON') // a 404 page — parsing it would mask the status
        },
      })),
    )
    render(<DatasetSearch onClose={() => {}} initialCityId="stpete" />)
    await waitFor(() => {
      const call = warn.mock.calls.find((c) =>
        /load failed/i.test(String(c[1])),
      )
      expect(call).toBeTruthy()
      const payload = JSON.stringify(call)
      expect(payload).toMatch(/404/)
      expect(payload).toMatch(/stpete/)
    })
  })
})
