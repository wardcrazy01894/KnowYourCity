# KnowYourCity — working agreement

A daily map-guessing game for local landmarks (St. Petersburg, FL first).
See `docs/PLAN.md` for architecture and `docs/DATA-SOURCING.md` for the data
pipeline. This file is the contract for how changes get made.

## Branch & PR workflow

- **All changes land via a Pull Request — never push directly to `main`.**
- Every PR runs these CI checks (and must be green before merge):
  - **build / typecheck / lint** — `npm ci`, `tsc --noEmit`, `eslint`,
    `prettier --check`, `vite build`.
  - **test** — `vitest run`.
  - **secret scan** — gitleaks over the branch history.
- Branches are **deleted automatically on merge** (`delete_branch_on_merge` is
  on). Use short-lived feature branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Prefer **squash merge** to keep `main` history linear and readable.

> ✅ **Enforced.** The repo is public and branch protection is active on `main`:
> all three CI checks above are **required** and **strict** (branch must be up to
> date), **conversation resolution is required** (no unresolved PR threads),
> rules **apply to admins**, and force-pushes/deletions are blocked. Re-apply or
> audit with `bash scripts/protect-main.sh`.
>
> Required approvals are **0** on purpose: this is a solo repo and GitHub won't
> let you approve your own PR, so requiring an approval would make every PR
> unmergeable. CI is the gate. Bump it to 1 if a second maintainer joins.

## Docs stay current in the same PR

If a change affects documented behavior, update the docs in the **same PR** —
never in a follow-up. The PR template has the checklist; the relevant targets:

- `README.md` — setup, commands, features.
- `docs/PLAN.md` — architecture, milestones, mechanics, scoring constants.
- `docs/DATA-SOURCING.md` — pipeline, query, the `Location` schema.
- `docs/OPERATIONS.md` — deploy, workers, dashboards, runbooks.
- `docs/QUESTIONS-FOR-ALEX.md` — strike questions as they get answered.
- `.env.example` / code comments — config and contracts.

**Docs map — when you touch the left, check the right (before opening the PR,
and again in every PR review):**

| Change touches…                                     | Update / verify                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/daily.ts`, `src/data/dailyOverrides.ts`    | PLAN §5.1 (selection + overrides), §5.2 (pin-day integrity rule)                              |
| `src/lib/scoring.ts`, `src/lib/geo.ts`              | PLAN §5.4 (constants, polygon rules)                                                          |
| `src/lib/version.ts`, `src/lib/mode.ts`, App shell  | PLAN §5.12 (auto-reload + midnight rollover)                                                  |
| `src/lib/leaderboard.ts`, `worker/leaderboard*`     | PLAN §11 (leaderboard) + `worker/README.md` (schema, rank/board semantics)                    |
| `worker/bug-report.mjs`                             | `worker/README.md` hardening list + PLAN §5.10b (defang vectors)                              |
| `.github/workflows/*`, `scripts/protect-main.sh`    | `docs/OPERATIONS.md` §Deploy + this file's CI-checks list                                     |
| `public/locations.*.json`, fame caches              | Counts in DATA-SOURCING (status/caps/§-table), PLAN (M2 + bucket example), BACKLOG, QUESTIONS |
| `data/<city>-manual.json` (manual must-includes)    | DATA-SOURCING §4 (manual entries) + the counts targets above if entries were added/removed    |
| `cities.json` (bounds, playCap, timeZone, new city) | PLAN §5.1 (playCap example) + DATA-SOURCING §4c + worker `CITY_TZ` (leaderboard-lib.mjs)      |
| `package.json` scripts / engines                    | README + this file's command lists                                                            |
| `scripts/*.mjs` pipeline behavior                   | DATA-SOURCING §§1–4 (the step that script implements)                                         |

Two habits make the rule stick: (1) PR bodies written via `gh pr create
--body-file` bypass the template checklist — walk the table yourself before
opening; (2) every PR **review** must include a docs-map pass over the diff
(the reviewer checks the right-hand column for every touched left-hand path).

**The map itself is part of the contract**: a PR that adds a subsystem, moves
or renames a file/doc section in the left or right column, or introduces a new
doc target must update the corresponding row (or add one) **in the same PR** —
a stale map quietly exempts new code from the rule. The reviewer's docs-map
pass covers this too: if the diff touches something no row maps, that's a
finding (add the row), and if a mapped section number no longer exists, that's
a finding (fix the row).

## How we write code — TDD is mandatory

Every behavior change is **test-first**: red → green → refactor.

1. **RED** — write the smallest failing `*.test.ts` that captures the behavior;
   run it and watch it fail for the _right_ reason. No impl before a red test.
2. **GREEN** — the least code that makes it pass. No untested branches.
3. **REFACTOR** — clean up with the suite green.

Use the **`/tdd-cycle`** skill to drive one change through the loop. Prefer
**pure functions** for logic (e.g. `scoreForDistance`, `selectDailyLocations`,
`shouldStartFresh`, `buildShareString`) so it's unit-testable without the DOM;
keep React/Leaflet shells thin and verify those manually. New logic that lands
without a test that would fail before it is incomplete — reviewers should push
back. (Pure data edits like adding a curated location are covered by the dataset
guard test, `src/lib/locations.test.ts`.)

## Local commands

```bash
npm install          # first time
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit (app) + tsconfig.worker.json (worker)
npm run lint         # eslint
npm test             # vitest run (write the test first!)
npm run format       # prettier --write (format:check in CI)
npm run build        # typecheck + vite build (what CI runs)
npm run fetch-pois   # rebuild data/candidates.json from OpenStreetMap
npm run fetch-food   # rebuild data/food-candidates.json from OpenStreetMap
npm run build-city   # assemble one city's public/locations.<id>.json
npm run add-polygons # backfill park/golf footprint rings from OSM
npm run check-chains # flag national chains that leaked past the fame pass
npm run pin-day      # freeze a city's live day BEFORE any dataset edit (owner rule)
```

Run `npm run typecheck && npm run lint && npm run format:check && npm test &&
npm run build` before opening a PR — that's exactly what CI gates on. Don't drop
`format:check`: CI runs `prettier --check` separately, and `npm run build`/`lint`
do **not** cover it, so a formatting-only diff can pass locally and still fail CI.
A PostToolUse hook auto-formats/lints TS files on edit
(`.claude/hooks/lint-on-edit.sh`), but it doesn't touch other file types — so
after editing Markdown or `.mjs`, run `npm run format` yourself (`format:check`
now covers `*.md` too). ESLint also lints the `.mjs` scripts/worker, and
`typecheck` type-checks the worker source via `tsconfig.worker.json`.

## Secrets

No secrets in the repo. The optional client config values (`VITE_MAPBOX_TOKEN`,
`VITE_CF_BEACON_TOKEN`, `VITE_BUG_ENDPOINT`, `VITE_TURNSTILE_SITEKEY`,
`VITE_LEADERBOARD_ENDPOINT`) go in `.env.local` (gitignored) locally and repo
**Variables** in CI. All are public
by design — they ship in the client bundle — so restrict the Mapbox token by
URL in the Mapbox dashboard rather than relying on secrecy. The only true
secrets (worker `GH_TOKEN`, `TURNSTILE_SECRET`) live in Cloudflare via
`wrangler secret put`, never in the repo.

## Git identity

Commits Claude makes are authored as `wardcrazy01894 <alanc3939@gmail.com>` via
inline `-c` overrides; pushes use the `github-wardcrazy` SSH remote alias.
