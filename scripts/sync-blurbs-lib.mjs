// Keep a city's blurb sidecar (public/blurbs.<city>.json) in lockstep with its
// dataset (public/locations.<city>.json). Pure — no filesystem; the CLI
// (sync-blurbs.mjs) and apply-difficulty.mjs supply the files.
//
// The problem this solves: blurbs are keyed by location id and written against
// a specific venue, but the dataset moves under them — apply-difficulty renames
// ids (`status: 'renamed'`), drops closed/junk/chain rows and de-dupes; the
// add-location skill re-pins coordinates; venues relocate. Without a mechanism
// a blurb silently describes the wrong place, or is orphaned and lost.
//
// Mechanism (see docs/DATA-SOURCING.md §4f):
//  - Every entry carries `writtenFor: {name, lat, lng}` — a snapshot of the
//    location the text was researched against — and `writtenOn`.
//  - `syncBlurbs` (run by apply-difficulty after every dataset rewrite, or by
//    `npm run sync-blurbs -- <city>` by hand):
//      · follows renames (old id → new id) so the text travels with the venue
//        (a rename onto an id that already has a blurb retires the incoming
//        entry instead — both texts survive, `collidedWith` says why);
//      · RETIRES the entry of any id that left the dataset into `retired`
//        (never deletes — re-adds happen) and RESTORES it if the id returns;
//      · marks any entry whose live location no longer matches its snapshot
//        (`needsReview: <why>`) — a name change or a move > STALE_MOVE_METERS.
//  - The guard test (src/lib/blurbs.data.test.ts) fails CI while any entry is
//    stale or flagged, so the PR that changed the location must resolve it:
//    re-read/edit the text, then `--accept <id>` re-snapshots and clears it.
import { haversineMeters } from './apply-difficulty-lib.mjs'

/** A move smaller than this is a precision re-pin of the same venue. */
export const STALE_MOVE_METERS = 150

const round5 = (n) => Math.round(n * 1e5) / 1e5

/** The identity a blurb is written against: display name + 5-dp coords. */
export function snapshotFor(loc) {
  return { name: loc.name, lat: round5(loc.lat), lng: round5(loc.lng) }
}

/**
 * Why `entry` no longer describes `loc`, or null if it still does. Pure so the
 * guard test can compute staleness itself (it must not trust a sync was run).
 */
export function staleReason(entry, loc) {
  const w = entry.writtenFor
  if (!w) return 'no writtenFor snapshot — run sync-blurbs --accept <id>'
  if (w.name !== loc.name) return `name changed: "${w.name}" -> "${loc.name}"`
  const m = haversineMeters(w, loc)
  if (m > STALE_MOVE_METERS) return `moved ${Math.round(m)} m since written`
  return null
}

const sortKeys = (obj) =>
  Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]]),
  )

/**
 * Reconcile a sidecar with the current locations.
 * @param {object} file   parsed public/blurbs.<city>.json (not mutated)
 * @param {object[]} locations  the dataset rows the sidecar must match
 * @param {{renames?: Map<string,string>, accept?: string[], today: string}} opts
 *   renames: oldId -> newId applied by this dataset rewrite (apply-difficulty)
 *   accept:  ids whose text has been re-read against the live location — their
 *            snapshot is refreshed and the review flag cleared ('*' = all)
 *   today:   YYYY-MM-DD stamp for retiredOn / writtenOn
 * @returns {{file: object, audit: {renamed:string[], collided:string[], retired:string[], restored:string[], stale:string[], accepted:string[], acceptNotFound:string[]}}}
 *   acceptNotFound: requested accept ids with no live blurb (typo / retired id)
 */
export function syncBlurbs(file, locations, opts) {
  const { renames = new Map(), accept = [], today } = opts
  if (!today) throw new Error('syncBlurbs: opts.today (YYYY-MM-DD) is required')
  const byId = new Map(locations.map((l) => [l.id, l]))
  const acceptAll = accept.includes('*')
  const acceptSet = new Set(accept)
  const audit = {
    renamed: [],
    collided: [],
    retired: [],
    restored: [],
    stale: [],
    accepted: [],
    acceptNotFound: [],
  }
  const original = file.blurbs ?? {}
  const retired = { ...(file.retired ?? {}) }

  // 1. Follow renames. A rename whose target id ALREADY has its own blurb
  //    (dedupeById: "renames can collide with an existing entry") must not
  //    let iteration order pick a winner — the existing entry keeps its id and
  //    the incoming one is retired under its old id, pointing at the collision,
  //    so both texts survive and the audit says what happened.
  const blurbs = {}
  for (const [id, entry] of Object.entries(original)) {
    const to = renames.get(id)
    if (!to || to === id || id in byId) {
      blurbs[id] = { ...entry }
    } else if (to in original) {
      audit.collided.push(`${id} -> ${to}`)
      retired[id] = { ...entry, retiredOn: today, collidedWith: to }
    } else {
      audit.renamed.push(`${id} -> ${to}`)
      blurbs[to] = { ...entry }
    }
  }

  // 2. Retire ids that left the dataset; restore retired ids that came back.
  for (const id of Object.keys(blurbs)) {
    if (byId.has(id)) continue
    retired[id] = { ...blurbs[id], retiredOn: today }
    delete blurbs[id]
    audit.retired.push(id)
  }
  for (const id of Object.keys(retired)) {
    if (!byId.has(id) || id in blurbs) continue
    const { retiredOn: _r, ...entry } = retired[id]
    void _r
    blurbs[id] = entry
    delete retired[id]
    audit.restored.push(id)
  }

  // 3. Accept (re-snapshot) or flag stale entries against the live location.
  for (const [id, entry] of Object.entries(blurbs)) {
    const loc = byId.get(id)
    if (acceptAll || acceptSet.has(id)) {
      delete entry.needsReview
      entry.writtenFor = snapshotFor(loc)
      entry.writtenOn = today
      audit.accepted.push(id)
      continue
    }
    const why = staleReason(entry, loc)
    if (why) {
      entry.needsReview = why
      audit.stale.push(id)
    } else {
      delete entry.needsReview
    }
  }

  for (const id of acceptSet)
    if (id !== '*' && !(id in blurbs)) audit.acceptNotFound.push(id)

  for (const k of Object.keys(audit)) audit[k].sort()
  const out = { ...file, blurbs: sortKeys(blurbs) }
  if (Object.keys(retired).length) out.retired = sortKeys(retired)
  else delete out.retired
  return { file: out, audit }
}
