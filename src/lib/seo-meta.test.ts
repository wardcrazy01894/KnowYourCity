import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guard the static SEO surface: head tags in index.html and the crawler/share
// assets under public/. These ship verbatim (no build step touches them), so a
// file-content test is the right level — there is no runtime logic to unit-test.

const root = join(__dirname, '..', '..')
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')

const SITE_URL = 'https://knowyourcity.gg/'

describe('index.html SEO head tags', () => {
  it('has a descriptive title naming the game', () => {
    expect(indexHtml).toMatch(/<title>Know Your City[^<]*<\/title>/)
  })

  it('has a canonical link to the production URL', () => {
    expect(indexHtml).toContain('rel="canonical"')
    expect(indexHtml).toContain(`href="${SITE_URL}"`)
  })

  it('has the core Open Graph tags', () => {
    for (const prop of [
      'og:title',
      'og:description',
      'og:image',
      'og:url',
      'og:type',
    ]) {
      expect(indexHtml).toContain(`property="${prop}"`)
    }
    // og:image must be an absolute URL — scrapers don't resolve relative paths.
    expect(indexHtml).toMatch(
      /property="og:image"\s+content="https:\/\/knowyourcity\.gg\//,
    )
  })

  it('has Twitter card tags with a large summary image', () => {
    expect(indexHtml).toContain('name="twitter:card"')
    expect(indexHtml).toContain('content="summary_large_image"')
  })

  it('declares icons and a theme color', () => {
    expect(indexHtml).toContain('rel="icon"')
    expect(indexHtml).toContain('rel="apple-touch-icon"')
    expect(indexHtml).toContain('name="theme-color"')
  })

  it('embeds JSON-LD structured data describing the game', () => {
    const m = indexHtml.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )
    expect(m, 'missing application/ld+json script').toBeTruthy()
    const ld = JSON.parse(m![1])
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld.name).toBe('Know Your City')
    expect(ld.url).toBe(SITE_URL)
  })

  it('has a noscript fallback so no-JS crawlers see real content', () => {
    expect(indexHtml).toMatch(
      /<noscript>[\s\S]*Know Your City[\s\S]*<\/noscript>/,
    )
  })
})

describe('public/ crawler + share assets', () => {
  it.each([
    'robots.txt',
    'sitemap.xml',
    'favicon.svg',
    'favicon.ico',
    'apple-touch-icon.png',
    'og-image.png',
  ])('ships %s', (file) => {
    expect(
      existsSync(join(root, 'public', file)),
      `public/${file} missing`,
    ).toBe(true)
  })

  it('robots.txt allows crawling and points at the sitemap', () => {
    const robots = readFileSync(join(root, 'public', 'robots.txt'), 'utf8')
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).toContain(`Sitemap: ${SITE_URL}sitemap.xml`)
  })

  it('sitemap.xml lists the site root', () => {
    const sitemap = readFileSync(join(root, 'public', 'sitemap.xml'), 'utf8')
    expect(sitemap).toContain('<urlset')
    expect(sitemap).toContain(`<loc>${SITE_URL}</loc>`)
  })

  it('og-image.png is a real PNG at 1200x630 (the OG-recommended size)', () => {
    const png = readFileSync(join(root, 'public', 'og-image.png'))
    // PNG magic bytes, then width/height from the IHDR chunk (bytes 16-23).
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })
})
