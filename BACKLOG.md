# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [x] **St. Pete dataset** — now ~516 (inclusive food/drink via `fetch-food` +
      curated landmarks). Target comfortably met. (Trimmed from ~609 when the
      map bounds were tightened back to a close-in zoom; far-beach outliers that
      fell outside the play box were dropped — see *Widen the bbox?* below.)
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
- [ ] **Tune city bounds** — State College, Ann Arbor & Seattle tightened to the
      core. Chicago's box is still fairly broad; refine to taste and re-run
      `build-city`.

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
- [ ] **Difficulty tiers (named, not "easy/medium/hard")** — let the player pick
      how deep-cut the day's places are, from instantly-recognizable to
      only-a-regular-would-know. Proposed ladder (creative names, tune later):
      **Postcard** (marquee landmarks everyone knows — Don CeSar, Tropicana
      Field, Sunken Gardens) → **Local** (well-known spots + notable
      restaurants/bars) → **Insider** (neighborhood favorites) → **Deep Cut /
      Legend** (obscure small restaurants, dive bars, the long tail). Implement
      by scoring each location's "obscurity" (e.g. presence of a
      `wikipedia`/`wikidata` tag, `category`, and a future popularity signal —
      see *Precise popularity filter* above) into a tier, then filter the daily
      pool by the chosen tier. Selection stays deterministic per day; tier just
      narrows the candidate set (and could feed the share string so friends
      compare tiers). Bigger datasets per city make the hard tiers viable.
- [ ] Scoring/difficulty tuning pass after real playtests (constants in
      `scoring.ts`).
- [ ] About/attribution panel (OSM ODbL + imagery credit) visible in the UI.
- [ ] **Share results: show numbers, not just colors** — the Wordle-style share
      is currently an emoji/color grid. Consider including the actual per-round
      scores (and the day's total, e.g. `420/500`) alongside or instead of the
      color squares, for people who want the real number. Keep it compact and
      spoiler-free (no place names). `buildShareString` in
      `src/components/Results.tsx`.
- [ ] **Share results: link to the site** — append the game URL to the share
      text so a shared result is clickable and drives new players (use the
      deployed Pages/custom-domain URL, not localhost). Pair with the numeric
      share above.
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
- [x] Data pipeline (M2): Overpass scripts (fetch-pois / fetch-food /
      build-city) → per-city `public/locations.<id>.json` (St. Pete ~609 +
      4 cities); the app loads the selected city's file; validated by a test.
- [x] Applied Alex's decisions: 0–100 linear scoring, midnight-ET rollover,
      clues hidden by default, whole-city start zoom.
