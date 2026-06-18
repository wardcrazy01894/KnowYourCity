import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  defaultState,
  loadState,
  saveState,
  clearState,
  applyStartupReset,
  STORAGE_VERSION,
  type PersistedState,
} from './storage'

/**
 * Minimal in-memory localStorage stub. vitest runs in the node environment (no
 * DOM), so we install our own Storage-shaped object on globalThis for these
 * tests. Each test gets a fresh one.
 */
function makeStorageStub() {
  const map = new Map<string, string>()
  return {
    map,
    storage: {
      get length() {
        return map.size
      },
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v))
      },
      removeItem: (k: string) => {
        map.delete(k)
      },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      clear: () => map.clear(),
    } as Storage,
  }
}

let stub: ReturnType<typeof makeStorageStub>

beforeEach(() => {
  stub = makeStorageStub()
  vi.stubGlobal('localStorage', stub.storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const sample = (over: Partial<PersistedState> = {}): PersistedState => ({
  version: STORAGE_VERSION,
  history: [{ dateKey: '2026-06-09', totalScore: 420, results: [] }],
  streak: { current: 3, best: 5, lastPlayedDateKey: '2026-06-09' },
  ...over,
})

describe('defaultState', () => {
  it('is a valid empty state at the current version', () => {
    const s = defaultState()
    expect(s.version).toBe(STORAGE_VERSION)
    expect(s.history).toEqual([])
    expect(s.streak).toEqual({ current: 0, best: 0, lastPlayedDateKey: null })
  })
})

describe('loadState', () => {
  it('returns a fresh default when nothing is saved', () => {
    expect(loadState('stpete')).toEqual(defaultState())
  })

  it('round-trips a saved state via saveState', () => {
    const state = sample()
    saveState('stpete', state)
    expect(loadState('stpete')).toEqual(state)
  })

  it('writes under the kyc: prefix (pins the key the seeded tests below rely on)', () => {
    saveState('stpete', sample())
    expect(stub.map.has(`kyc:v${STORAGE_VERSION}:stpete`)).toBe(true)
  })

  it('resets to default on a version mismatch (schema bump must not brick players)', () => {
    // Simulate data written by an older build with a different version.
    stub.map.set(
      `kyc:v${STORAGE_VERSION}:stpete`,
      JSON.stringify({ ...sample(), version: STORAGE_VERSION - 1 }),
    )
    expect(loadState('stpete')).toEqual(defaultState())
  })

  it('returns default (never throws) on corrupt JSON', () => {
    stub.map.set(`kyc:v${STORAGE_VERSION}:stpete`, '{ not valid json ]')
    expect(() => loadState('stpete')).not.toThrow()
    expect(loadState('stpete')).toEqual(defaultState())
  })

  it('returns default (never throws) when storage access throws', () => {
    // Throw on ANY access (e.g. Safari private mode), not just getItem — so the
    // test still guards if loadState is ever refactored to touch storage
    // differently (otherwise it could pass on an unrelated TypeError).
    vi.stubGlobal(
      'localStorage',
      new Proxy(
        {},
        {
          get() {
            throw new Error('SecurityError: storage disabled')
          },
        },
      ) as unknown as Storage,
    )
    expect(() => loadState('stpete')).not.toThrow()
    expect(loadState('stpete')).toEqual(defaultState())
  })

  it('namespaces state per city (one city does not leak into another)', () => {
    const sp = sample({
      streak: { current: 7, best: 7, lastPlayedDateKey: 'x' },
    })
    saveState('stpete', sp)
    expect(loadState('stpete')).toEqual(sp)
    expect(loadState('seattle')).toEqual(defaultState())
  })
})

describe('saveState', () => {
  it('swallows quota/serialization errors (best-effort, never throws)', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as unknown as Storage)
    expect(() => saveState('stpete', sample())).not.toThrow()
  })
})

describe('clearState', () => {
  it('removes ONLY the given city’s key, leaving other cities + namespaces intact', () => {
    saveState('stpete', sample())
    saveState('stpete__shuffle', sample())
    saveState('seattle', sample())
    stub.map.set('unrelated:key', 'keep-me')
    clearState('stpete')
    // Only the official stpete save is gone.
    expect(loadState('stpete')).toEqual(defaultState())
    // The isolated shuffle namespace and other cities are untouched.
    expect(loadState('stpete__shuffle')).not.toEqual(defaultState())
    expect(loadState('seattle')).not.toEqual(defaultState())
    expect(stub.map.get('unrelated:key')).toBe('keep-me')
  })

  it('never throws when storage access fails', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('disabled')
      },
    } as unknown as Storage)
    expect(() => clearState('stpete')).not.toThrow()
  })
})

describe('applyStartupReset', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does nothing and returns false when there is no fresh-start flag', () => {
    vi.stubGlobal('window', { location: { search: '' } })
    saveState('stpete', sample())
    expect(applyStartupReset('stpete')).toBe(false)
    expect(loadState('stpete')).not.toEqual(defaultState())
  })

  it('clears the active namespace and returns true when the URL asks for a fresh start', () => {
    vi.stubGlobal('window', { location: { search: '?reset' } })
    saveState('stpete', sample())
    expect(applyStartupReset('stpete')).toBe(true)
    expect(loadState('stpete')).toEqual(defaultState())
  })

  it('a ?shuffle reset clears ONLY the shuffle namespace, never the official daily', () => {
    // The bug: ?shuffle wiped the real in-progress daily via a blanket clear.
    vi.stubGlobal('window', { location: { search: '?shuffle' } })
    saveState('stpete', sample()) // the official daily in progress
    saveState('stpete__shuffle', sample()) // a previous shuffle game
    expect(applyStartupReset('stpete__shuffle')).toBe(true)
    expect(loadState('stpete')).not.toEqual(defaultState()) // daily preserved
    expect(loadState('stpete__shuffle')).toEqual(defaultState()) // shuffle cleared
  })

  it('returns false (clears nothing) when no active city namespace is known', () => {
    vi.stubGlobal('window', { location: { search: '?reset' } })
    saveState('stpete', sample())
    expect(applyStartupReset(null)).toBe(false)
    expect(loadState('stpete')).not.toEqual(defaultState())
  })
})
