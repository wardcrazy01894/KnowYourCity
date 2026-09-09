// Pure normalization of blurb-research results before they touch a sidecar.
// See apply-blurbs.mjs (CLI) and docs/DATA-SOURCING.md §4f.

/** Hard cap on blurb length: ~3 sentences; the recap card is a phone-width box. */
export const MAX_CHARS = 600
/** Hard cap on the one-line "what kind of place" descriptor. */
export const MAX_DESCRIPTOR_CHARS = 100
/** Research confidence tiers that are allowed into the shipped sidecar. */
export const ACCEPTED_CONFIDENCE = new Set(['high', 'medium'])

const collapse = (s) => s.replace(/\s+/g, ' ').trim()

/**
 * Hosts that are never "read more" material: geocoders, search engines, and
 * raw map-DATA pages. A research agent sometimes cites the lookup it used to
 * confirm an address — including an openstreetmap.org node/way page, which is
 * a database record of tags, not something a player would read. That belongs
 * in the `note` as provenance, never as a player-facing link. (This also
 * catches nominatim.openstreetmap.org and malformed doubled-domain OSM URLs.)
 */
const JUNK_SOURCE = new RegExp(
  [
    // Raw OSM database pages and the Nominatim geocoder, any subdomain.
    String.raw`^https://([^/]*\.)?openstreetmap\.org/`,
    // Search engines.
    String.raw`^https://([^/]*\.)?(bing|duckduckgo|yahoo)\.com/`,
    // Google MAPS and SEARCH only — not the whole domain. sites.google.com
    // and docs.google.com host real institutional pages (a university's
    // building-name histories, say), and rejecting those loses good sources.
    String.raw`^https://maps\.google\.[a-z.]+/`,
    // /url is Google's own redirect wrapper, /local is a Maps surface.
    String.raw`^https://(www\.)?google\.[a-z.]+/(maps|search|url|local)\b`,
    // Google Maps short links, which hide a Maps URL behind another host.
    String.raw`^https://(maps\.app\.)?goo\.gl/`,
    String.raw`^https://g\.page/`,
  ].join('|'),
  'i',
)

/**
 * Promotional language that needs a human look before shipping. An accolade is
 * fine when a specific award is NAMED and independently sourced (a James Beard
 * listing, a city's own stewardship award); it is not fine as a vague boast,
 * especially with the venue's own site as the only source.
 *
 * Checks `text` AND `descriptor`: shipping "award-winning" in a descriptor
 * while the text read clean is exactly how this slipped through twice.
 */
const PROMOTIONAL =
  /award[- ]winning|best[- ]kept|must[- ]see|renowned|beloved|nestled|hidden[- ]gem|world[- ]class/gi

/**
 * Pure: rows whose prose contains promotional language, with the matched terms.
 * apply-blurbs prints these on every run so the check can't be forgotten.
 * @returns {Array<{id:string, terms:string[]}>}
 */
export function promotionalHits(rows) {
  const out = []
  for (const r of rows) {
    if (!r || typeof r.id !== 'string') continue
    const blob = `${r.text ?? ''} ${r.descriptor ?? ''}`
    const terms = [
      ...new Set((blob.match(PROMOTIONAL) ?? []).map((t) => t.toLowerCase())),
    ]
    if (terms.length) out.push({ id: r.id, terms })
  }
  return out
}

/**
 * Has this sidecar entry been written? A descriptor-only entry (researched,
 * no story) counts — it is NOT a placeholder, must not be re-researched, and
 * must not be overwritten without --force. Shared by the generator's
 * candidate filter and the apply gate so the two can't disagree.
 */
export function isWritten(entry) {
  return Boolean(((entry?.text ?? '') + (entry?.descriptor ?? '')).trim())
}

/**
 * Filter + clean research rows.
 * @param {Array<{id:string,text:string,descriptor?:string,sources?:string[],confidence?:string}>} rows
 * @param {{knownIds:Set<string>, existing?:Record<string,{text?:string}>, force?:boolean}} opts
 * @returns {{accepted: Array<{id:string,text:string,descriptor:string,sources:string[]}>, skipped: Record<string,string[]>}}
 */
export function normalizeBlurbResults(rows, opts) {
  const { knownIds, existing = {}, force = false } = opts
  const skipped = {
    'unknown id': [],
    'nothing usable (no text, no descriptor)': [],
    'too long': [],
    'already written (use --force)': [],
    'no https source': [],
  }
  const accepted = []
  const seen = new Set()
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id)) continue
    seen.add(r.id)
    // The STORY is gated on confidence (an invented fact is worse than none);
    // the factual DESCRIPTOR survives regardless — a researched spot must at
    // least say what kind of place it is (owner rule, 2026-09-04).
    const text = ACCEPTED_CONFIDENCE.has(r.confidence)
      ? collapse(String(r.text ?? ''))
      : ''
    const descriptor = collapse(String(r.descriptor ?? ''))
    if (!knownIds.has(r.id)) {
      skipped['unknown id'].push(r.id)
      continue
    }
    if (!text && !descriptor) {
      skipped['nothing usable (no text, no descriptor)'].push(r.id)
      continue
    }
    if (text.length > MAX_CHARS || descriptor.length > MAX_DESCRIPTOR_CHARS) {
      skipped['too long'].push(r.id)
      continue
    }
    if (!force && isWritten(existing[r.id])) {
      skipped['already written (use --force)'].push(r.id)
      continue
    }
    const sources = [...new Set((r.sources ?? []).map(String))]
      .filter((s) => /^https:\/\/\S+$/.test(s) && !JUNK_SOURCE.test(s))
      .slice(0, 2)
    // A story must be backed by a link; a bare descriptor (what kind of place)
    // is low-risk and may stand on its own.
    if (text && sources.length === 0) {
      skipped['no https source'].push(r.id)
      continue
    }
    accepted.push({ id: r.id, text, descriptor, sources })
  }
  for (const k of Object.keys(skipped)) skipped[k].sort()
  return { accepted, skipped }
}
