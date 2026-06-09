// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'

/**
 * DOM-level test for the BugReport form: proves send() actually wires the
 * Turnstile reset on failure (the unit test in BugReport.test.ts only covers the
 * resetTurnstile helper in isolation). Turnstile is mocked on window, and the
 * report module is mocked so we can drive ok/!ok responses.
 *
 * BugReport reads VITE_TURNSTILE_SITEKEY into a module-level const at import, so
 * we stub the env first and import the component dynamically inside each test.
 */

const { submitBugReport } = vi.hoisted(() => ({ submitBugReport: vi.fn() }))
vi.mock('../lib/report', () => ({ submitBugReport }))

const reset = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'test-sitekey')
  ;(window as unknown as { turnstile: unknown }).turnstile = {
    render: () => 'widget-1',
    remove: vi.fn(),
    reset,
    getResponse: () => 'turnstile-token',
  }
  submitBugReport.mockReset()
  reset.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete (window as unknown as { turnstile?: unknown }).turnstile
})

async function renderForm() {
  const { BugReport } = await import('./BugReport')
  return render(<BugReport onClose={() => {}} context={{ city: 'seattle' }} />)
}

function fillAndSend() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'the map went grey' },
  })
  fireEvent.click(screen.getByRole('button', { name: /send report/i }))
}

describe('BugReport — Turnstile reset wiring', () => {
  it('resets the Turnstile token after a failed send so a retry can succeed', async () => {
    submitBugReport.mockResolvedValue({ ok: false }) // worker rejected, no fallback
    await renderForm()
    fillAndSend()
    await waitFor(() => expect(reset).toHaveBeenCalledWith('widget-1'))
    expect(await screen.findByText(/couldn't send/i)).toBeTruthy()
  })

  it('resets the token when the send throws', async () => {
    submitBugReport.mockRejectedValue(new Error('network down'))
    await renderForm()
    fillAndSend()
    await waitFor(() => expect(reset).toHaveBeenCalledWith('widget-1'))
  })

  it('does NOT reset the token on a successful send', async () => {
    submitBugReport.mockResolvedValue({
      ok: true,
      url: 'https://github.com/owner/repo/issues/2',
    })
    await renderForm()
    fillAndSend()
    expect(await screen.findByText(/your report was sent/i)).toBeTruthy()
    expect(reset).not.toHaveBeenCalled()
  })
})
