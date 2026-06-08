# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [ ] **Difficulty rollout — other 4 cities.** St. Pete SHIPPED (PR #40): every
      location has an `easy`/`medium`/`hard` `difficulty` (inverse of local fame,
      from a fame+status web-research pass), and the daily game runs **2 easy →
      2 medium → 1 hard** (layering category variety). **Seattle, Chicago, Ann
      Arbor & State College still use the legacy cafe→…→wildcard plan** until each
      gets its own pass (~1.3M agent-tokens each; needs 1M-context subagent
      credits enabled). Run them one at a time. See `docs/PLAN.md` §5.1b/§5.3b,
      `docs/DATA-SOURCING.md` §4b, and the memory note `difficulty-rating-research`.
- [ ] **Generalize difficulty enrichment.** The St. Pete pass was a one-off
      (`scripts/apply-difficulty-stpete.mjs`, deliberately refuses to re-run).
      Fold fame-scoring + status cleanup + city-relative percentile bucketing
      (narrow-easy 20/45/35) into `build-city` so newly-added locations get scored
      and re-bucketed automatically. (Buckets are city-relative, so adding rows
      shifts them — same stability tradeoff as daily selection.) **Note:** the +19
      parks/lakes added by `scripts/add-parks.mjs` (St. Pete, from player reports)
      carry **hand-assigned** difficulty, not fame-derived — fold them into the
      first generalized re-bucketing pass.
- [x] **St. Pete dataset** — inclusive food/drink via `fetch-food` + curated
      landmarks. Peaked at ~516; the fame+status pass (PR #40) then **trimmed it
      to 382** (removed 104 permanently-closed + 28 zero-presence junk + 1
      renamed-to-closed; updated 15 renames; merged 1 dupe).
- [ ] **Precise popularity filter** — current inclusion uses an OSM
      "established business" proxy. A true "≥100 Yelp reviews" cut needs a paid
      Yelp/Google integration (ToS forbids storing their data long-term); the
      license-clean alternative is the Foursquare OS Places open dataset.
- [ ] **Closed-spot cleanup** — inclusive OSM pulls can include a few stale
      entries; maintain a per-city ban list / extend `CLOSED`. (St. Pete swept by
      the fame+status pass in PR #40 — 133 closed/junk removed; the other cities
      get the same sweep as part of their difficulty rollout above.)
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
- [ ] **Difficulty tiers (named, not "easy/medium/hard")** — the base
      easy/medium/hard difficulty SHIPPED (PR #40) and drives the daily ramp; this
      item is now the *optional* polish of renaming/expanding those into a
      player-pickable ladder. Let the player pick how deep-cut the day's places
      are, from instantly-recognizable to only-a-regular-would-know. Proposed
      ladder (creative names, tune later):
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
- [ ] **Prod-harden the bug worker's origin allowlist** — drop the `localhost`
      entries from `ALLOWED_ORIGIN` in `worker/wrangler.toml` once dev no longer
      needs them, so only the live Pages origin can use the public endpoint.
      (Deferred 2026-06-07; low priority — the per-IP rate limit + Turnstile
      already gate abuse.)
- [ ] **Share results: show numbers, not just colors** — the Wordle-style share
      is currently an emoji/color grid. Consider including the actual per-round
      scores (and the day's total, e.g. `420/500`) alongside or instead of the
      color squares, for people who want the real number. Keep it compact and
      spoiler-free (no place names). `buildShareString` in
      `src/components/Results.tsx`.
- [x] **Share results: link to the site** — the share text now ends with the
      game URL (`shareSiteUrl()` = origin + Vite `base`, so it's correct on Pages
      and a future custom domain). See `buildShareString` in
      `src/components/Results.tsx`.
- [ ] Optional backend for shared online leaderboards.

## Done
- [x] **Difficulty system (St. Pete)** — per-location easy/medium/hard from a
      fame+status web-research pass, calibrated to a human local's blind ratings;
      daily plan switched to 2 easy → 2 medium → 1 hard; St. Pete cleaned 516→382.
      PR #40. (Rollout to other cities tracked under *In progress / next*.)
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
