import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { LocationsFile } from '../types'
import { CITIES } from './cities'
import { parseBlurbsFile } from './blurbs'
// @ts-expect-error plain-JS pipeline module (unit-tested in scripts/sync-blurbs.test.mjs)
import { staleReason } from '../../scripts/sync-blurbs-lib.mjs'

/**
 * Guard for the hand-edited blurb sidecars (`public/blurbs.<city>.json`, see
 * docs/DATA-SOURCING.md §4f). A city may have no sidecar at all (the recap then
 * shows placeholders everywhere), but one that exists must parse, name its own
 * city, key only REAL location ids (a typo or a renamed id would silently
 * orphan a write-up), and carry player-ready text with https "read more" links.
 *
 * Sync guard: every entry must carry a `writtenFor` snapshot that still matches
 * the live location (same name, moved < STALE_MOVE_METERS) and no `needsReview`
 * flag. Staleness is COMPUTED here, not read from the file, so a dataset edit
 * that skipped `npm run sync-blurbs` still fails CI. Resolve by re-reading the
 * text against the changed location, then `sync-blurbs -- <city> --accept <id>`.
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

    it('is in sync with the dataset: snapshots match, nothing awaits review', () => {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as {
        blurbs: Record<string, { needsReview?: string }>
      }
      const byId = new Map(dataset.locations.map((l) => [l.id, l]))
      const problems: string[] = []
      for (const [id, entry] of Object.entries(raw.blurbs)) {
        const loc = byId.get(id)
        if (!loc) continue // reported by the orphan check above
        const why =
          (staleReason(entry, loc) as string | null) ?? entry.needsReview
        if (why) problems.push(`${id}: ${why}`)
      }
      expect(
        problems,
        `blurbs out of sync with locations.${city.id}.json — re-read, then \`npm run sync-blurbs -- ${city.id} --accept <id>\``,
      ).toEqual([])
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
