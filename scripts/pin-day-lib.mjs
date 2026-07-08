// @ts-check
/**
 * pin-day-lib.mjs — pure source-file transforms for `pin-day` (see pin-day.ts).
 *
 * Owner rule (2026-07-08): once a day's lineup is set it must NEVER change.
 * The PRNG daily selection is a function of the in-play pool, so ANY dataset
 * edit (even adding one venue) can re-roll the current day under players —
 * exactly what happened when the Horse & Jockey batch landed mid-day. The fix
 * is process + tooling: before a dataset-changing PR, `pin-day` computes the
 * city's current-day lineup from the PRE-change dataset and freezes it as a
 * DAILY_OVERRIDES entry. These helpers do the src/data/dailyOverrides.ts text
 * surgery; kept as plain JS string ops so they're unit-testable without TS.
 */

/** Render one DAILY_OVERRIDES entry in the file's existing style. */
export function renderOverrideEntry(seed, ids, note) {
  const [city, date] = seed.split(':')
  const lines = [
    `  // ${city} — pinned ${date} (${note})`,
    `  '${seed}': [`,
    ...ids.map((id) => `    '${id}',`),
    `  ],`,
  ]
  return lines.join('\n')
}

/**
 * Insert a new pinned entry into the dailyOverrides.ts SOURCE text, just
 * before the object's closing brace. Throws if the seed is already present —
 * a set day never changes, so an existing pin must never be overwritten.
 */
export function insertOverrideEntry(source, seed, ids, note = 'pin-day') {
  if (source.includes(`'${seed}'`))
    throw new Error(`${seed} is already pinned — a set day never changes`)
  const entry = renderOverrideEntry(seed, ids, note)
  // Empty object form: `...= {}` → expand it (don't eat the trailing newline).
  const empty = /= \{\}[ \t]*$/m
  if (empty.test(source)) return source.replace(empty, `= {\n${entry}\n}`)
  // Populated form: insert before the final closing `}` line.
  const close = /\n\}\s*$/
  if (!close.test(source))
    throw new Error('unrecognized dailyOverrides.ts shape')
  return source.replace(close, `\n${entry}\n}\n`)
}
