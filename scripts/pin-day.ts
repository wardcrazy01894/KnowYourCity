/**
 * pin-day — freeze a city's daily lineup as a DAILY_OVERRIDES entry, so a
 * dataset edit can never re-roll a day players are already living through.
 *
 * Owner rule (2026-07-08): once a day's lineup is set it NEVER changes, even
 * when a location is added mid-day. The PRNG selection is a function of the
 * in-play pool, so run this BEFORE landing any dataset-changing PR:
 *
 *   npm run pin-day -- <city>                 # pin city-local today from the
 *                                             # working-tree dataset
 *   npm run pin-day -- <city> --ref <sha>     # compute from the dataset at a
 *                                             # past git ref (restore a lineup
 *                                             # an edit already re-rolled)
 *   npm run pin-day -- <city> --date YYYY-MM-DD
 *
 * Skips (exit 0) if the seed is already pinned — a set day never changes.
 * After running: `npm run format` (the entry is plain source text), then
 * commit src/data/dailyOverrides.ts in the same PR as the dataset change.
 * The locations guard test validates every pinned id (exists, inPlay,
 * distinct) against the CURRENT dataset — if a dataset edit removes a pinned
 * venue, CI fails and the pin must be resolved consciously.
 *
 * Runtime: uses Node's TypeScript type-stripping to import the REAL selection
 * code (src/lib/daily.ts) — no duplicated PRNG logic to drift. Node 24+
 * (or 22.6+ with --experimental-strip-types).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
// @ts-expect-error plain-JS helper module (unit-tested in pin-day.test.mjs)
import { insertOverrideEntry } from './pin-day-lib.mjs'
import { selectDailyLocations, getDateKey } from '../src/lib/daily.ts'
import { DAILY_OVERRIDES } from '../src/data/dailyOverrides.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const city = args.find((a) => !a.startsWith('--'))
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const cities = JSON.parse(
  readFileSync(path.join(ROOT, 'cities.json'), 'utf8'),
) as { id: string; timeZone: string }[]
const cityCfg = cities.find((c) => c.id === city)
if (!city || !cityCfg) {
  console.error(
    `usage: npm run pin-day -- <city> [--date YYYY-MM-DD] [--ref <git-ref>]\n` +
      `known cities: ${cities.map((c) => c.id).join(', ')}`,
  )
  process.exit(1)
}

const date = flag('date') ?? getDateKey(new Date(), cityCfg.timeZone)
const seed = `${city}:${date}`
if (DAILY_OVERRIDES[seed]) {
  console.log(
    `${seed} already pinned — nothing to do (a set day never changes)`,
  )
  process.exit(0)
}

const ref = flag('ref')
const datasetPath = `public/locations.${city}.json`
const raw = ref
  ? execFileSync('git', ['show', `${ref}:${datasetPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  : readFileSync(path.join(ROOT, datasetPath), 'utf8')
const locations = JSON.parse(raw).locations

// Pass the REAL overrides so behavior matches production exactly (the seed
// above was just checked to be un-pinned, so this always runs the PRNG).
const picks = selectDailyLocations(locations, seed, undefined, DAILY_OVERRIDES)
const ids = picks.map((l) => l.id)
console.log(`${seed} (${ref ? `dataset @ ${ref}` : 'working tree'}):`)
for (const p of picks) console.log(`  ${p.id}  (${p.difficulty ?? '?'})`)

const overridesPath = path.join(ROOT, 'src/data/dailyOverrides.ts')
const source = readFileSync(overridesPath, 'utf8')
const note = ref ? `pin-day from ${ref}` : 'pin-day'
writeFileSync(overridesPath, insertOverrideEntry(source, seed, ids, note))
console.log(`pinned → src/data/dailyOverrides.ts (run: npm run format)`)
