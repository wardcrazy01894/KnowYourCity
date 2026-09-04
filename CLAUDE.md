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

| Change touches…                                     | Update / verify                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/daily.ts`, `src/data/dailyOverrides.ts`    | PLAN §5.1 (selection + overrides), §5.2 (pin-day integrity rule)                                      |
| `src/lib/scoring.ts`, `src/lib/geo.ts`              | PLAN §5.4 (constants, polygon rules)                                                                  |
| `src/components/MapGuess.tsx` (+ its render test)   | PLAN §6 (map integration)                                                                             |
| `DayRecap.tsx`, `RecapMap.tsx`, `lib/blurbs.ts`     | PLAN §5.13 (day recap) + DATA-SOURCING §4f (`public/blurbs.*.json` schema, authoring, status)         |
| `scripts/sync-blurbs*.mjs`, `public/blurbs.*.json`  | DATA-SOURCING §4f (sync mechanism, `--accept` flow) + the blurb guard test if the file shape changes  |
| `src/lib/version.ts`, `src/lib/mode.ts`, App shell  | PLAN §5.12 (auto-reload + midnight rollover)                                                          |
| `src/lib/leaderboard.ts`, `worker/leaderboard*`     | PLAN §11 (leaderboard) + `worker/README.md` (schema, rank/board semantics)                            |
| `worker/bug-report.mjs`                             | `worker/README.md` hardening list + PLAN §5.10b (defang vectors)                                      |
| `.github/workflows/*`, `scripts/protect-main.sh`    | `docs/OPERATIONS.md` §Deploy + this file's CI-checks list                                             |
| `.github/dependabot.yml`, `package-lock.json`       | `docs/OPERATIONS.md` §Dependency updates (policy). Routine lockfile bumps: verify only, no doc change |
| `public/locations.*.json`, fame caches              | Counts in DATA-SOURCING (status/caps/§-table), PLAN (M2 + bucket example), BACKLOG, QUESTIONS         |
| `data/<city>-manual.json` (manual must-includes)    | DATA-SOURCING §4 (manual entries) + the counts targets above if entries were added/removed            |
| `cities.json` (bounds, playCap, timeZone, new city) | PLAN §5.1 (playCap example) + DATA-SOURCING §4c + worker `CITY_TZ` (leaderboard-lib.mjs)              |
| `eslint.config.js` (rules, ignores, files blocks)   | This file's §Lint rule policy (staged/downgraded rules need a why)                                    |
| `package.json` scripts / engines                    | README + this file's command lists + DATA-SOURCING §1 (it cites `engines` for the Node baseline)      |
| `scripts/*.mjs` pipeline behavior                   | DATA-SOURCING §§1–4 (the step that script implements)                                                 |

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
keep React/Leaflet shells thin. Those shells are largely verified manually, but
the parts with a checkable structural invariant are not exempt — `MapGuess` now
has `MapGuess.render.test.tsx` asserting one map instance under StrictMode and
no cross-round Leaflet layer leaks, which is what guards the `[M-D1]` polygon
cleanup. New logic that lands
without a test that would fail before it is incomplete — reviewers should push
back. (Pure data edits like adding a curated location are covered by the dataset
guard test, `src/lib/locations.test.ts`.)

## Lint rule policy

`npm run lint` gates on **errors**; warnings are advisory and do not fail CI
(there is no `--max-warnings`). A rule may be set to `warn` instead of `error`
only as a **staged migration** — the config must carry a comment saying what
downgraded it, why the violations weren't fixed in that PR, and that fixing
them is a follow-up. Never set a rule to `off` to make an upgrade land.

An **inline** `eslint-disable-line` / `eslint-disable-next-line` is allowed for
a one-off, and must carry a comment saying why — see the eight
`react-hooks/exhaustive-deps` disables across `App.tsx`, `Game.tsx`,
`MapGuess.tsx`, `Leaderboard.tsx` and `Results.tsx`, each of which does. Prefer
an inline disable with a reason over downgrading a rule repo-wide.

Currently staged (from `eslint-plugin-react-hooks` v5 → v7, which ESLint 10
requires): `react-hooks/refs` and `react-hooks/set-state-in-effect` — 7
violations across `App.tsx`, `MapGuess.tsx`, `DatasetSearch.tsx`, all
deliberate documented patterns. Fixing them changes runtime behavior, so per
the TDD rule above it must be test-first. Tracked in `BACKLOG.md`, which
records the trigger condition: they are safe only while the app uses no
concurrent React features.

Note that v7's `recommended` also enables 12 further React-Compiler rules — 10
at `error` (`purity`, `immutability`, `static-components`, `use-memo`,
`preserve-manual-memoization`, `error-boundaries`, `set-state-in-render`,
`globals`, `config`, `gating`) and 2 at `warn` (`incompatible-library`,
`unsupported-syntax`). They all pass as of PR #167 — recorded here so a future
failure from one is traceable to that upgrade.

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
npm run sync-blurbs  # reconcile a city's blurb sidecar with its dataset (--accept <id> after re-reading)
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

Everything Claude does here is attributed to the `wardcrazy01894` account, wired
through the local Claude Code config (`~/.claude/settings.json` → `env`) rather
than per-command flags — so no `-c` overrides or `--user` flags are needed:

| Surface                     | Mechanism                                                     |
| --------------------------- | ------------------------------------------------------------- |
| Commit author + committer   | `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars                   |
| `git push`                  | the `github-wardcrazy` SSH remote alias (see `git remote -v`) |
| `gh` CLI (PRs, issues, API) | `GH_CONFIG_DIR=~/.claude/gh-wardcrazy`, authed as wardcrazy   |

Because the env vars cover committer as well as author, merge/rebase/amend commits
are attributed correctly too — including merges made to satisfy branch protection.
The owner's own terminal has none of these vars set, so manual commits and `gh`
calls keep using their personal account. Don't run `git config --global user.*` or
`gh auth switch` to fix an identity problem: both change the owner's manual-commit
identity. Full rationale lives in the owner's global `~/.claude/CLAUDE.md`.
