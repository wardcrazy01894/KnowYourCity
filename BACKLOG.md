# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [x] **St. Pete dataset** — now ~519 (inclusive food/drink via `fetch-food` +
      curated landmarks). Target comfortably met.
- [ ] **Precise popularity filter** — current inclusion uses an OSM
      "established business" proxy. A true "≥100 Yelp reviews" cut needs a paid
      Yelp/Google integration (ToS forbids storing their data long-term); the
      license-clean alternative is the Foursquare OS Places open dataset.
- [ ] **Closed-spot cleanup** — inclusive OSM pulls can include a few stale
      entries; maintain a per-city ban list / extend `CLOSED`.
- [ ] **Widen the bbox?** — decide whether to expand the box to recapture the Old
      Sunshine Skyway fishing pier (south) and north-county golf (e.g. Bardmoor),
      which fell just outside. Bounds also gate the play-area map.

## Multi-city (shipped — extend as desired)
- [x] **City picker + 5 cities** — St. Pete, State College, Ann Arbor, Seattle,
      Chicago, via `cities.json` + `build-city`. Picker landing screen; per-city
      bounds/timezone/streaks.
- [ ] **More cities / region search** — add to `cities.json` + `build-city`. A
      type-to-search picker would scale better than buttons past ~10 cities.
- [ ] **Tune city bounds** — a few were eyeballed (esp. Seattle/Chicago which are
      large); refine to taste.

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
