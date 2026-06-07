# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [ ] **Grow the St. Pete dataset to ~200** — the launch target. Currently ~61
      (landmarks + independent cafés/restaurants/bars). Keep curating more
      single-location locals from a broad Overpass pull. Apply Alex's
      must-include / banned lists when ready.
- [ ] **Widen the bbox?** — decide whether to expand the box to recapture the Old
      Sunshine Skyway fishing pier (south) and north-county golf (e.g. Bardmoor),
      which fell just outside. Bounds also gate the play-area map.

## The multi-city vision (bigger arc)
- [ ] **City/region picker landing page** — the homepage becomes "what area are
      you playing?" (search your city), which routes into that city's daily game.
- [ ] **Multi-city support** — generalize from St. Pete to many cities
      (Ann Arbor, Seattle, Chicago, …). Model each as data:
      `City = { id, name, timeZone, bounds, locationsUrl }`. The engine is
      already city-agnostic (`getDateKey(now, timeZone)`,
      `selectDailyLocations(list, dateKey)`); mainly needs a city registry, the
      picker UI, routing, and a curated ~200-place `locations.json` per city.

## Soon
- [ ] **Photo rounds** — show a photo (e.g. the Don CeSar) instead of/alongside
      the name. `photoUrl` is already in the schema; source from Wikimedia
      Commons (free). v1 stays text-only by decision.
- [ ] **Persistence / stats UI** — surface a stats panel + an "already played
      today" view (resume mid-day + streaks already work under the hood).
- [ ] **Deploy to GitHub Pages** — publish at
      `wardcrazy01894.github.io/KnowYourLocals/` (free for public repos). Add a
      Pages Actions workflow.

## Later / nice-to-have
- [ ] **Custom domain** — Alex wants one eventually (name TBD; maybe a `.gg`).
      Add a `CNAME` and set Vite `base: '/'`.
- [ ] Scoring/difficulty tuning pass after real playtests (constants in
      `scoring.ts`).
- [ ] About/attribution panel (OSM ODbL + imagery credit) visible in the UI.
- [ ] Optional backend for shared online leaderboards.

## Done
- [x] Project scaffold + plan/docs (PLAN, DATA-SOURCING, QUESTIONS-FOR-ALEX).
- [x] Deterministic daily selection (midnight-Eastern, DST-aware) + 0–100 linear
      scoring, with unit tests.
- [x] CI (typecheck/lint/format/build/test/secret-scan).
- [x] Repo public + branch protection enforced (PR-only, required checks,
      delete-on-merge) — `scripts/protect-main.sh`.
- [x] Playable game (M3+M4+M6): Leaflet satellite map, pin-drop guessing,
      scoring + reveal, 5-round flow, results + Wordle share, localStorage
      resume + streaks.
- [x] Data pipeline (M2): Overpass fetch script + 29 curated St. Pete landmarks
      in public/locations.json; app loads it with a sample fallback; dataset
      validated by a test.
- [x] Applied Alex's decisions: 0–100 linear scoring, midnight-ET rollover,
      clues hidden by default, whole-city start zoom.
