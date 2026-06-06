# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [ ] **Playable game (M3+M4+M6)** — Leaflet satellite map with pin placement,
      5-round flow with scoring, reveal of the true location, results screen +
      Wordle-style share. Goal: `npm run dev` is fully playable on sample data.

## Soon
- [ ] **Real St. Pete dataset (M2)** — implement `scripts/fetch-pois.mjs`
      (Overpass), curate `public/locations.json` to ~60+ notable landmarks,
      switch the app off `locations.sample.json`.
- [ ] **Persistence polish (M5)** — resume an in-progress day, streak/history UI.
- [ ] **Deploy (M7)** — GitHub Pages (needs repo public or Pages-on-private;
      awaiting Alex's go-ahead to publish).
- [ ] **Enforce branch protection** — needs the repo to be public (Free plan) or
      GitHub Pro. Once decided, run `bash scripts/protect-main.sh`. Until then
      the PR workflow is convention-only (see CLAUDE.md).

## Later / nice-to-have
- [ ] Photo rounds (fill `photoUrl` from Wikimedia Commons; e.g. Don CeSar).
- [ ] Difficulty tuning pass after playtest (scoring constants, start zoom).
- [ ] About/attribution panel (OSM ODbL + imagery credit) in the UI.
- [ ] Optional backend for shared online leaderboards.
- [ ] Second city beyond St. Pete.

## Done
- [x] Project scaffold + plan/docs (PLAN, DATA-SOURCING, QUESTIONS-FOR-ALEX).
- [x] Deterministic daily selection + city-scale scoring (with unit tests).
- [x] CI (typecheck/lint/format/build/test/secret-scan) + branch protection.
