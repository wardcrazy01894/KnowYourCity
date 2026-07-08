// @ts-check
/**
 * check-chains-lib.mjs — the scan logic behind `npm run check-chains`,
 * extracted so it's unit-testable (scan M6): which IN-PLAY rows get flagged
 * for national-chain review. matchNationalChain (the name matcher) is covered
 * by apply-difficulty tests; this pins the filter/exclusion wiring around it.
 */
import { matchNationalChain } from './apply-difficulty-lib.mjs'

/**
 * Rows to review: in play, name matches the chain list, and not a verified
 * local namesake (`cfg.keepIds`).
 *
 * @param {Array<{id: string, name: string, inPlay?: boolean}>} locations
 * @param {{chains: string[], keepIds: Record<string, string>}} cfg
 * @returns {Array<{l: object, chain: string}>}
 */
export function chainCandidates(locations, cfg) {
  return locations
    .filter((l) => l.inPlay !== false)
    .map((l) => ({ l, chain: matchNationalChain(l.name, cfg.chains) }))
    .filter((x) => x.chain && !cfg.keepIds[x.l.id])
}
