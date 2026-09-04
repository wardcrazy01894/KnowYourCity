import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { LocationsFile } from '../types'
import { CITIES } from './cities'
import { parseBlurbsFile } from './blurbs'

/**
 * Guard for the hand-edited blurb sidecars (`public/blurbs.<city>.json`, see
 * docs/DATA-SOURCING.md §4f). A city may have no sidecar at all (the recap then
 * shows placeholders everywhere), but one that exists must parse, name its own
 * city, key only REAL location ids (a typo or a renamed id would silently
 * orphan a write-up), and carry player-ready text with https "read more" links.
 */

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url))

for (const city of CITIES) {
  const file = path.join(PUBLIC, `blurbs.${city.id}.json`)
  describe(`blurbs sidecar: ${city.id}`, () => {
    if (!existsSync(file)) {
      it.skip('no sidecar yet — recap shows the rollout placeholder', () => {})
      return
    }
    const parsed = parseBlurbsFile(JSON.parse(readFileSync(file, 'utf8')))
    const dataset = JSON.parse(
      readFileSync(path.join(PUBLIC, `locations.${city.id}.json`), 'utf8'),
    ) as LocationsFile
    const ids = new Set(dataset.locations.map((l) => l.id))

    it('parses and names its own city', () => {
      expect(
        parsed,
        `${file} is malformed (see parseBlurbsFile)`,
      ).not.toBeNull()
      expect(parsed!.city).toBe(city.id)
    })

    it('keys only ids that exist in the city dataset', () => {
      const orphans = Object.keys(parsed!.blurbs).filter((id) => !ids.has(id))
      expect(orphans, 'blurb ids not in the dataset').toEqual([])
    })

    it('has non-empty text and https sources on every entry', () => {
      for (const [id, b] of Object.entries(parsed!.blurbs)) {
        expect(b.text.trim().length, `${id}: empty text`).toBeGreaterThan(0)
        for (const s of b.sources ?? [])
          expect(s, `${id}: source must be https`).toMatch(/^https:\/\//)
      }
    })
  })
}
