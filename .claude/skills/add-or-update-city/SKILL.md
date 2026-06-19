---
name: add-or-update-city
description: Add a new city (or refresh an existing one) end-to-end — register it in cities.json, fetch its locations from OpenStreetMap, run the agentic fame+status pass, enrich with difficulty, and open a PR. Use when the user says "add <city>", "build <city>", "refresh/rebuild <city>'s dataset", or "run the fame pass for <city>".
argument-hint: <city name or id, e.g. "Ann Arbor" or "annarbor"; optionally "uncapped">
---

# Add or update a city

Drives a city from nothing (or a stale dataset) to a **difficulty-enriched**
`public/locations.<id>.json` that uses the 2-easy/2-medium/1-hard daily plan,
then opens a PR. This is the repeatable version of the St. Pete and State College
passes. Read `docs/DATA-SOURCING.md` §4b and `docs/PLAN.md` §5.1b/§5.3b first.

> **OSM alone is stale — cross-check with Google Places** (owner directive). The
> Overpass pull seeds candidates, but verify each venue's `business_status` /
> current name / `userRatingCount` against the Google Places API
> (`GOOGLE_MAPS_KEY` in `.env.local`) during the fame+status pass so a new city
> doesn't launch with closed/renamed pins. Commit coords from Nominatim/Census
> (ODbL-clean). See the `google-maps-verification` memory + `BACKLOG.md`.

**Prerequisite — subagents must work.** The fame pass fans out web-research
subagents. If the Agent tool fails with _"Usage credits required for 1M
context"_, the session is on the 1M-context model. Fix before starting: run
`/model claude-opus-4-8` (standard context) or `/usage-credits`. See memory
`subagents-need-standard-context`.

Arguments: **$ARGUMENTS** — a city name or id (and optionally `uncapped`).

## 1. Register / confirm the city in `cities.json`

Each city is one object: `id` (kebab slug), `name`, `short`, `timeZone` (IANA),
`bounds` `[[s,w],[n,e]]`, and `target`.

- **New city:** add the entry. Pick a tight `bounds` over the core (the map locks
  pan/zoom to it). Get bounds from OSM/Nominatim for the place.
- **`target`:** a number caps the set with a balanced category mix (~30/18/22/30
  landmark/cafe/bar/restaurant); **`null` = uncapped** — fetch everything and let
  the fame pass trim the tail. Prefer `null` for "keep as many as make sense";
  the fame pass drops closed/junk/chains, so the final count self-selects.
- `target` is typed `number | null` in `src/lib/cities.ts` — keep both in sync
  (the app reads `cities.ts`, the build script reads `cities.json`).

## 2. Fetch the dataset — `npm run build-city -- <id>`

Pulls landmarks (`fetch-pois` logic) + inclusive food/drink (`fetch-food` logic)
from Overpass for the bbox, composes via `composeLocations` (deduped, in-bounds,
capped or uncapped per `target`), merges any `data/<id>-manual.json`, writes
`public/locations.<id>.json`. Overpass can 504 under load — just re-run.

Confirm it parses and is in-bounds:

```bash
npx vitest run src/lib/locations.test.ts
```

(Unenriched cities pass under the legacy category plan.)

## 3. Fame + status pass (agentic web research)

Fan out subagents (~20 locations each) that, per location, return:
`status` (open|closed|renamed|uncertain), `currentName` (if renamed),
`fameScore` 0-100, `reviewCount`, `hasWikipedia`, `isNationalChain`, `statusNote`.

**Rubric** (calibrate to LOCAL ubiquity, not tourist/critic fame): most
restaurants/bars 20-60; 80+ almost exclusively iconic non-food landmarks; mark
zero-web-presence/generic names `uncertain` (they get dropped). Anchor a few
well-known local icons by name so scores are comparable across batches.

Run it as a background `Workflow` that chunks the city's `[id,name,category]`
tuples and `parallel()`s a `schema`-validated agent per batch (model: `sonnet`
is enough). Pass the tuples as `args` and **guard `typeof args === 'string'`** —
the runtime may deliver `args` as a JSON string (parse it). Collect, then save
the workflow's returned `{results}` to a file and feed step 4. Template lives at
`scripts/fame-workflow.template.md`. Cache → `data/fame-<id>.json` (committed for
provenance) happens in step 4.

> **Big cities / session limits — harvest, don't re-research.** For a large
> uncapped city the pass can be 100+ batches and may straddle a session-limit
> reset. Don't pass thousands of tuples through `args` (too large to emit by
> hand) — instead generate a workflow **script file** with the tuples embedded as
> a literal and launch via `scriptPath`. The Workflow persists each batch's result
> to `agent-*.jsonl` as it finishes, so completed work survives a death. Recover +
> resume with **`scripts/harvest-fame-transcripts.mjs <workflowsDir> data/fame-<id>.json
tuples.json`**: it rebuilds the results (recursive + merge-mode), reports MISSING
> ids, and writes their tuples so you launch a follow-up workflow over **only the
> remainder**. Loop harvest→follow-up until MISSING = 0, then step 4. (Seattle's
> 2782-location pass took three runs across two resets this way.)

## 4. Enrich — `node scripts/apply-difficulty.mjs <id> <fame-output.json>`

Generalized, **re-runnable** pass: removes permanently-closed + `uncertain` junk

- national chains + renamed-to-closed; applies renames; de-dupes (keeps higher
  fame); buckets **top 20% easy / 45% medium / 35% hard** by city-relative fame;
  writes `public/locations.<id>.json` and `data/fame-<id>.json`; prints an audit.

**Eyeball the audit.** Sanity-check the easy bucket (should be the city's true
icons), the junk/chain removals (no real local staple wrongly dropped), and the
final count. Re-run after dataset changes — buckets are relative.

## 5. Gate, docs, PR

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

The guard (`src/lib/locations.test.ts`) now enforces valid difficulty on every
row and a fillable 2/2/1 plan. Then update docs in the **same PR**:

- `docs/DATA-SOURCING.md` — status/count, note the city is enriched.
- `BACKLOG.md` — tick the city off the difficulty rollout.
- `README.md` if city-facing.

Open the PR with `/pr` (or `/pr-pipeline` if shipping alongside others). Commits
are authored as `wardcrazy01894`; main is protected (PR-only).
