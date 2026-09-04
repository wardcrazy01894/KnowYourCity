#!/usr/bin/env node
// Reconcile a city's blurb sidecar with its dataset — see sync-blurbs-lib.mjs
// for the mechanism and docs/DATA-SOURCING.md §4f for the workflow.
//
//   npm run sync-blurbs -- <city>                  # follow renames, retire/restore,
//                                                  # flag stale entries (needsReview)
//   npm run sync-blurbs -- <city> --accept a,b     # after re-reading those blurbs
//                                                  # against the live location:
//                                                  # re-snapshot + clear the flag
//   npm run sync-blurbs -- <city> --accept-all     # same, every entry (first-time
//                                                  # authoring / bulk import)
//   npm run sync-blurbs -- <city> --check          # report only, exit 1 if stale
//
// apply-difficulty.mjs runs the same sync automatically after every dataset
// rewrite (it knows the renames it applied); this CLI is for hand edits.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'
import { syncBlurbs } from './sync-blurbs-lib.mjs'

const args = process.argv.slice(2)
const city = args.find((a) => !a.startsWith('--'))
if (!city)
  throw new Error(
    'Usage: node scripts/sync-blurbs.mjs <city> [--accept id,id | --accept-all] [--check]',
  )
const flagVal = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const accept = args.includes('--accept-all')
  ? ['*']
  : (flagVal('accept') ?? '').split(',').filter(Boolean)
const check = args.includes('--check')

const SIDECAR = new URL(`../public/blurbs.${city}.json`, import.meta.url)
const DATASET = new URL(`../public/locations.${city}.json`, import.meta.url)
if (!existsSync(SIDECAR)) {
  console.log(
    `no sidecar for ${city} (public/blurbs.${city}.json) — nothing to sync`,
  )
  process.exit(0)
}
const file = JSON.parse(readFileSync(SIDECAR, 'utf8'))
const { locations } = JSON.parse(readFileSync(DATASET, 'utf8'))
const today = new Date().toISOString().slice(0, 10)

const { file: out, audit } = syncBlurbs(file, locations, { accept, today })
for (const [k, v] of Object.entries(audit))
  if (v.length) console.log(`${k} (${v.length}):\n  ${v.join('\n  ')}`)
if (audit.stale.length)
  console.log(
    `\n${audit.stale.length} entr${audit.stale.length === 1 ? 'y' : 'ies'} need review — re-read the text against the live location, then --accept <id>`,
  )

if (audit.acceptNotFound.length) {
  console.error(
    `--accept: no live blurb for ${audit.acceptNotFound.join(', ')} (typo? or retired — check the \`retired\` section). Nothing written.`,
  )
  process.exit(1)
}
if (check) process.exit(audit.stale.length ? 1 : 0)

// Format through the repo's Prettier config so the output is directly committable.
const path = fileURLToPath(SIDECAR)
const formatted = await prettier.format(JSON.stringify(out, null, 2), {
  ...(await prettier.resolveConfig(path)),
  parser: 'json',
})
writeFileSync(SIDECAR, formatted)
console.log(
  `wrote public/blurbs.${city}.json — ${Object.keys(out.blurbs).length} blurbs, ${Object.keys(out.retired ?? {}).length} retired`,
)
