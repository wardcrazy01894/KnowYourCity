# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [ ] **Grow the dataset** — 29 curated landmarks now ship; expand toward ~60+
      for rarer repeats (re-run `npm run fetch-pois`, curate more from
      `data/candidates.json`). Consider widening the bbox to recapture the Old
      Sunshine Skyway pier and north-county courses that fell just outside.

## Soon
- [ ] **Persistence polish (M5)** — history/stats UI (resume mid-day + streaks
      already work; surface a stats panel and an "already played today" view).
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
- [x] Playable game (M3+M4+M6): Leaflet satellite map, pin-drop guessing,
      scoring + reveal, 5-round flow, results + Wordle share, localStorage
      resume + streaks.
- [x] Data pipeline (M2): Overpass fetch script + 29 curated St. Pete landmarks
      in public/locations.json; app loads it with a sample fallback; dataset
      validated by a test.
