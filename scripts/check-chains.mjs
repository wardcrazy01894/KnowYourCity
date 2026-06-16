#!/usr/bin/env node
// Flag in-play venues whose name matches the national-chain list — an initial
// review aid, NOT an auto-remover. Verify each hit: if it's a real national
// chain, mark `isNationalChain: true` in data/fame-<city>.json and re-run
// `apply-difficulty.mjs <city>`; if it's a local namesake (e.g. "The Village Inn
// Bar"), add its id to `keepIds` in data/national-chains.json. A CI guard test
// (apply-difficulty.test.mjs) fails if an unresolved match is left in-play.
//
// Usage: node scripts/check-chains.mjs [cityId]   (omit cityId to scan all)
import { readFileSync, readdirSync } from 'node:fs'
import { matchNationalChain } from './apply-difficulty-lib.mjs'

const cfg = JSON.parse(
  readFileSync(new URL('../data/national-chains.json', import.meta.url)),
)
const only = process.argv[2]
const cities = only
  ? [only]
  : readdirSync(new URL('../public/', import.meta.url))
      .filter((f) => /^locations\..+\.json$/.test(f))
      .map((f) => f.match(/^locations\.(.+)\.json$/)[1])

let total = 0
for (const city of cities) {
  const locs = JSON.parse(
    readFileSync(new URL(`../public/locations.${city}.json`, import.meta.url)),
  ).locations
  const hits = locs
    .filter((l) => l.inPlay !== false)
    .map((l) => ({ l, chain: matchNationalChain(l.name, cfg.chains) }))
    .filter((x) => x.chain && !cfg.keepIds[x.l.id])
  if (hits.length) {
    console.log(`\n=== ${city}: ${hits.length} to review ===`)
    for (const { l, chain } of hits)
      console.log(`  [${chain}] ${l.name} (${l.id})`)
    total += hits.length
  }
}
console.log(
  total
    ? `\n${total} candidate(s) — verify each, then mark isNationalChain (real chain) or add to keepIds (local namesake).`
    : 'No national-chain candidates in any play set. ✓',
)
