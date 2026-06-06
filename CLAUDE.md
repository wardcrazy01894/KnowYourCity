# KnowYourLocals — working agreement

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

> ⚠️ **Enforcement is not yet active.** GitHub branch protection requires a
> **public** repo on the Free plan (or GitHub Pro). This repo is currently
> private, so the rules above are convention-only and CI is informational, not a
> hard gate. To make them enforced: make the repo public, then run
> `bash scripts/protect-main.sh`. Until then, treat the PR flow as mandatory by
> discipline.

## Docs stay current in the same PR

If a change affects documented behavior, update the docs in the **same PR** —
never in a follow-up. The PR template has the checklist; the relevant targets:

- `README.md` — setup, commands, features.
- `docs/PLAN.md` — architecture, milestones, mechanics, scoring constants.
- `docs/DATA-SOURCING.md` — pipeline, query, the `Location` schema.
- `docs/QUESTIONS-FOR-ALEX.md` — strike questions as they get answered.
- `.env.example` / code comments — config and contracts.

## Local commands

```bash
npm install          # first time
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write (format:check in CI)
npm run build        # typecheck + vite build (what CI runs)
npm run fetch-pois   # rebuild data/candidates.json from OpenStreetMap
```

Run `npm run typecheck && npm run lint && npm run build` before opening a PR —
that's exactly what CI gates on. A PostToolUse hook auto-formats/lints TS files
on edit (`.claude/hooks/lint-on-edit.sh`) to keep that green.

## Secrets

No secrets in the repo. The only optional secret is `VITE_MAPBOX_TOKEN`, which
goes in `.env.local` (gitignored). Note it ships in the client bundle by design,
so restrict it by URL in the Mapbox dashboard rather than relying on secrecy.

## Git identity

Commits Claude makes are authored as `wardcrazy01894 <alanc3939@gmail.com>` via
inline `-c` overrides; pushes use the `github-wardcrazy` SSH remote alias.
