// Pure normalization of blurb-research results before they touch a sidecar.
// See apply-blurbs.mjs (CLI) and docs/DATA-SOURCING.md §4f.

/** Hard cap on blurb length: ~3 sentences; the recap card is a phone-width box. */
export const MAX_CHARS = 480
/** Research confidence tiers that are allowed into the shipped sidecar. */
export const ACCEPTED_CONFIDENCE = new Set(['high', 'medium'])

const collapse = (s) => s.replace(/\s+/g, ' ').trim()

/**
 * Filter + clean research rows.
 * @param {Array<{id:string,text:string,sources?:string[],confidence?:string}>} rows
 * @param {{knownIds:Set<string>, existing?:Record<string,{text?:string}>, force?:boolean}} opts
 * @returns {{accepted: Array<{id:string,text:string,sources:string[]}>, skipped: Record<string,string[]>}}
 */
export function normalizeBlurbResults(rows, opts) {
  const { knownIds, existing = {}, force = false } = opts
  const skipped = {
    'unknown id': [],
    'blank text': [],
    'low confidence': [],
    'too long': [],
    'already written (use --force)': [],
    'no https source': [],
  }
  const accepted = []
  const seen = new Set()
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id)) continue
    seen.add(r.id)
    const text = collapse(String(r.text ?? ''))
    if (!knownIds.has(r.id)) {
      skipped['unknown id'].push(r.id)
      continue
    }
    if (!text) {
      skipped['blank text'].push(r.id)
      continue
    }
    if (!ACCEPTED_CONFIDENCE.has(r.confidence)) {
      skipped['low confidence'].push(r.id)
      continue
    }
    if (text.length > MAX_CHARS) {
      skipped['too long'].push(r.id)
      continue
    }
    if (!force && (existing[r.id]?.text ?? '').trim()) {
      skipped['already written (use --force)'].push(r.id)
      continue
    }
    const sources = [...new Set((r.sources ?? []).map(String))]
      .filter((s) => /^https:\/\/\S+$/.test(s))
      .slice(0, 2)
    if (sources.length === 0) {
      skipped['no https source'].push(r.id)
      continue
    }
    accepted.push({ id: r.id, text, sources })
  }
  for (const k of Object.keys(skipped)) skipped[k].sort()
  return { accepted, skipped }
}
