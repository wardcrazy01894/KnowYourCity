---
name: tdd-cycle
description: Walk a single behavior change through this repo's mandatory red-green-refactor loop. Use when implementing a feature, filling in a stub, or fixing a bug — anything that changes behavior. Enforces test-first.
argument-hint: <behavior or stub to implement, e.g. "buildShareString" or "city picker routing">
allowed-tools: [Read, Edit, Write, Bash, Glob, Grep]
model: sonnet
---

# TDD cycle (red → green → refactor)

TDD is **mandatory** in this repo (see CLAUDE.md "How we write code"). This skill
runs one behavior change through the loop. Do not write implementation before a
failing test exists.

Target for this cycle: **$ARGUMENTS**

## 0. Orient

- Read the relevant code + any doc that describes the intended behavior
  (`docs/PLAN.md`, `BACKLOG.md`).
- Identify the unit under test (SUT) and its collaborators. **Prefer extracting
  pure functions** (like `scoreForDistance`, `selectDailyLocations`,
  `shouldStartFresh`, `buildShareString`) so logic is testable without the DOM.
  Mock collaborators, never the SUT.
- Tests live next to the code as `*.test.ts` and run under **vitest** (Node env,
  no DOM). If a behavior truly needs the DOM/Leaflet, keep the testable logic in
  a pure helper and leave the thin React/Leaflet shell for manual verification.

## 1. RED — write the smallest failing test

- Add the minimal test capturing the desired behavior to the matching
  `*.test.ts` (create it if needed).
- Run it and **confirm it fails for the right reason** (missing/return), not an
  import typo:

  ```bash
  npx vitest run -t "<part of the test name>"
  ```

  If it passes or errors for an unrelated reason, fix the test until it's red for
  the intended reason. Skipping red is how silent regressions ship.

## 2. GREEN — minimum implementation

- Write the least code that makes the test pass. No extra fields, no
  future-proofing, no untested branches.

  ```bash
  npx vitest run -t "<part of the test name>"
  ```

## 3. REFACTOR — clean up under green

- Improve names, dedupe, structure — with the test green the whole time.
- Run the full gate; all must stay green:

  ```bash
  npm run typecheck && npm run lint && npm test && npm run build
  ```

## 4. Docs + commit/PR boundary

- Update any doc the change makes stale (README / CLAUDE.md / docs/PLAN.md /
  docs/DATA-SOURCING.md / BACKLOG.md). The PR template has the checklist.
- One red→green→refactor unit is a good commit. `main` is protected — open a PR
  (`/pr`); CI re-runs the same gate.

## Anti-patterns (reject these)

- Writing impl first, then tests that just describe what it already does.
- Mocking the unit under test.
- "Obviously passes" — always see it fail first.
- A test that passes only because it never calls the code path.
- Burying logic inside a React component where it can't be unit-tested — extract
  a pure function instead.
