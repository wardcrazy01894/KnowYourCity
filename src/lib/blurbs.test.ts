import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  BLURB_PLACEHOLDER,
  blurbsUrl,
  categoryLabel,
  fetchBlurbs,
  parseBlurbsFile,
  resolveBlurb,
  type BlurbsFile,
} from './blurbs'

const FILE: BlurbsFile = {
  version: 1,
  city: 'stpete',
  blurbs: {
    'sunken-gardens': {
      text: 'A century-old botanical garden built in a drained sinkhole.',
      sources: ['https://en.wikipedia.org/wiki/Sunken_Gardens_(Florida)'],
    },
    'no-sources': { text: 'Just text.' },
    'blank-text': { text: '   ' },
    'descriptor-only': {
      text: '',
      descriptor: 'Neighborhood dive bar with a tiki patio',
      sources: ['https://example.org/d'],
    },
  },
}

describe('resolveBlurb', () => {
  it('returns the written blurb + sources when the id is present', () => {
    expect(resolveBlurb(FILE, 'sunken-gardens')).toEqual({
      text: 'A century-old botanical garden built in a drained sinkhole.',
      descriptor: '',
      sources: ['https://en.wikipedia.org/wiki/Sunken_Gardens_(Florida)'],
      placeholder: false,
    })
  })

  it('defaults sources to an empty list', () => {
    expect(resolveBlurb(FILE, 'no-sources')).toEqual({
      text: 'Just text.',
      descriptor: '',
      sources: [],
      placeholder: false,
    })
  })

  it('a researched spot with no fun fact still shows what kind of place it is', () => {
    // Placeholder means "never attempted" — a spot we DID research but found
    // no story for keeps its descriptor line and is NOT a placeholder.
    expect(resolveBlurb(FILE, 'descriptor-only')).toEqual({
      text: '',
      descriptor: 'Neighborhood dive bar with a tiki patio',
      sources: ['https://example.org/d'],
      placeholder: false,
    })
  })

  it('falls back to the rollout placeholder for an unknown id', () => {
    expect(resolveBlurb(FILE, 'the-vinoy')).toEqual({
      text: BLURB_PLACEHOLDER,
      descriptor: '',
      sources: [],
      placeholder: true,
    })
  })

  it('treats a blurb with neither text nor descriptor as not written yet', () => {
    expect(resolveBlurb(FILE, 'blank-text').placeholder).toBe(true)
  })

  it('falls back to the placeholder when no file loaded (404/offline)', () => {
    expect(resolveBlurb(null, 'sunken-gardens')).toEqual({
      text: BLURB_PLACEHOLDER,
      descriptor: '',
      sources: [],
      placeholder: true,
    })
  })

  it('placeholder copy says the feature has not rolled out for this spot', () => {
    // The wording is a product decision (owner, 2026-09-04): the map still
    // shows every location; only the write-up is pending.
    expect(BLURB_PLACEHOLDER).toMatch(/rolled out/i)
  })
})

describe('parseBlurbsFile', () => {
  it('accepts a well-formed file', () => {
    expect(parseBlurbsFile(FILE)).toEqual(FILE)
  })

  it('rejects non-objects, missing blurbs map, and non-string text', () => {
    expect(parseBlurbsFile(null)).toBeNull()
    expect(parseBlurbsFile('nope')).toBeNull()
    expect(parseBlurbsFile({ version: 1, city: 'x' })).toBeNull()
    expect(
      parseBlurbsFile({ version: 1, city: 'x', blurbs: { a: { text: 3 } } }),
    ).toBeNull()
    expect(
      parseBlurbsFile({
        version: 1,
        city: 'x',
        blurbs: { a: { text: 'ok', sources: 'not-a-list' } },
      }),
    ).toBeNull()
  })

  it('drops non-https sources (defense in depth: sources become <a href>)', () => {
    const parsed = parseBlurbsFile({
      version: 1,
      city: 'x',
      blurbs: {
        a: {
          text: 'ok',
          sources: [
            'javascript:alert(1)',
            'http://plain.example',
            'https://ok.example/p',
          ],
        },
      },
    })
    expect(parsed?.blurbs.a.sources).toEqual(['https://ok.example/p'])
  })

  it('keeps a string descriptor and rejects a non-string one', () => {
    expect(parseBlurbsFile(FILE)?.blurbs['descriptor-only'].descriptor).toBe(
      'Neighborhood dive bar with a tiki patio',
    )
    expect(
      parseBlurbsFile({
        version: 1,
        city: 'x',
        blurbs: { a: { text: 'ok', descriptor: 42 } },
      }),
    ).toBeNull()
  })

  it('rejects an unknown schema version', () => {
    expect(parseBlurbsFile({ ...FILE, version: 2 })).toBeNull()
  })
})

describe('blurbsUrl', () => {
  it('is a per-city sidecar next to the dataset, cache-busted per deploy', () => {
    const url = blurbsUrl('seattle')
    expect(url).toMatch(/blurbs\.seattle\.json\?v=/)
    expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true)
  })
})

describe('fetchBlurbs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the parsed file on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(FILE), { status: 200 })),
    )
    expect(await fetchBlurbs('stpete')).toEqual(FILE)
  })

  it('returns null (never throws) on 404 — a city with no blurbs yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    expect(await fetchBlurbs('chicago')).toBeNull()
  })

  it('returns null on a network failure or malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await fetchBlurbs('stpete')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"version":1}', { status: 200 })),
    )
    expect(await fetchBlurbs('stpete')).toBeNull()
  })
})

describe('categoryLabel', () => {
  it('turns a category slug into a human label with an emoji', () => {
    expect(categoryLabel('golf_course')).toBe('⛳ Golf course')
    expect(categoryLabel('park')).toBe('🏞️ Park')
    expect(categoryLabel('restaurant')).toBe('🍽️ Restaurant')
    expect(categoryLabel('other')).toBe('📍 Place')
  })
})
