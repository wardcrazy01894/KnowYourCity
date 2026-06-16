# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [x] **Difficulty rollout — all cities done.** St. Pete (PR #40), **State
      College**, **Ann Arbor**, **Seattle**, and **Chicago** SHIPPED: every
      location has an `easy`/`medium`/`hard` `difficulty` (inverse of local fame,
      from a fame+status web-research pass), and the daily game runs **2 easy → 2
      medium → 1 hard** (layering category variety). Use the
      **`add-or-update-city` skill** for any future city — it runs the whole flow.
      See `docs/PLAN.md` §5.1b/§5.3b, `docs/DATA-SOURCING.md` §4b, and memory
      `difficulty-rating-research`. (Chicago's uncapped pass — 5325 fetched →
      4150 enriched, top 700 in play — ran crash-safe across ~5 session-limit
      resets via `scripts/gen-fame-workflow.mjs` + `harvest-fame-transcripts.mjs`.)
- [x] **Generalize difficulty enrichment.** `scripts/apply-difficulty.mjs <city>`
      is the generalized, re-runnable successor to the St. Pete one-off — status
      cleanup (closed/junk/national-chains/renames) + de-dupe + city-relative
      percentile bucketing (narrow-easy 20/45/35). Driven by the
      `add-or-update-city` skill + `scripts/fame-workflow.template.md`. (Still
      optional: fold it directly into `build-city` so a rebuild auto-enriches in one
      step.) **Note:** the +19 St. Pete parks/lakes (a one-off import, now living
      in `data/stpete-manual.json`) carry hand-assigned difficulty — fold them
      into St. Pete's next fame re-bucketing pass.
- [x] **St. Pete dataset** — inclusive food/drink via `fetch-food` + curated
      landmarks. Peaked at ~516; the fame+status pass (PR #40) then **trimmed it
      to 382** (removed 104 permanently-closed + 28 zero-presence junk + 1
      renamed-to-closed; updated 15 renames; merged 1 dupe). The +19 parks/lakes
      pass (PR #49) brought it to 401; the play-cap re-run (PR #59) re-deduped to
      389; issue-requested adds + nearby sweep (#50/#51) brought it to **396**;
      removing the closed DeSanto Bar (issue #81) brought it to **395**;
      +3 John's Pass Village adds (issue #85, Sculley's + nearby sweep) brought it
      to **398**; removing the closed McAuley's Pub (now The Local Draught House)
      brought it to **397**; a Google Places freshness sweep then re-pinned 7
      relocated venues, renamed 4 to their current successor, removed 5
      truly-closed, and added 4 new spots → **396** (all in play — the cap is 400).
- [ ] **Build new cities from OSM + Google Maps, not OSM alone** (owner directive,
      2026-06-16 — "OSM has outdated data"). `build-city.mjs` pulls only live
      Overpass today, so a new city can launch with stale closed/renamed pins (the
      St. Pete Places sweep, PR #102, found ~18). Cross-check candidates against the
      **Google Places API** (`business_status` to drop closed, current name for
      renames, `userRatingCount` as a fame/inclusion signal) during the
      `add-or-update-city` flow. Keep **committed coords from Nominatim/Census**
      (ODbL-clean) — Google verifies, doesn't get stored beyond `place_id`. Key is
      `GOOGLE_MAPS_KEY` in `.env.local`. (`build-city` already honors a
      `data/<city>-manual.json` **override layer** — a manual id that matches an OSM
      candidate replaces it — added in PR #103 so re-pins survive a rebuild.)
- [ ] **Precise popularity filter** — current inclusion uses an OSM
      "established business" proxy. A true "≥100 Yelp reviews" cut needs a paid
      Yelp/Google integration (ToS forbids storing their data long-term); the
      license-clean alternative is the Foursquare OS Places open dataset.
- [ ] **Closed-spot cleanup** — inclusive OSM pulls can include a few stale
      entries; maintain a per-city ban list / extend `CLOSED`. (St. Pete swept by
      the fame+status pass in PR #40 — 133 closed/junk removed; the other cities
      get the same sweep as part of their difficulty rollout above.)
- [ ] **Strip OSM code-prefixed display names in the pipeline.** Some OSM nodes
      carry a survey-code prefix glued to the name (Chicago had `KE34-Cubs`,
      `KE14-The Cubby Bear`, `KE37-Harry Caray's`, `IC6-Gerald J Roper Gateway` —
      `park`-category points sitting kilometres from the famous venue whose name
      they borrow, so the fame agent name-matched them to spurious 60–97 scores).
      Chicago's were marked `uncertain` in `data/fame-chicago.json` and dropped on
      re-run, but the systemic fix is a `cleanDisplayName` step in
      `composeLocations`/`build-city` (regex `^[A-Z]{2,3}\d+-`, TDD) so future
      cities/regens don't reintroduce them. Watch for other mislabeled-but-clean
      names that name-match a famous venue at the wrong coordinates.
- [ ] **Widen the bbox?** — decide whether to expand the box to recapture the Old
      Sunshine Skyway fishing pier (south) and north-county golf (e.g. Bardmoor),
      which fell just outside. Bounds also gate the play-area map.
- [x] **Collapse same-business alternate-slug dupes in the pipeline.** Inclusive
      OSM pulls double-list a few businesses under near-identical names but
      different slugs. `dedupeByNameProximity` (in `apply-difficulty-lib.mjs`, TDD)
      now collapses rows that share a normalized name (with `&`→"and" and a
      trailing city token like "Seattle" stripped) **AND** sit within ~150 m,
      keeping the higher fame (id tie-break for determinism); same-name rows that
      are far apart are LEFT ALONE as genuine multi-location businesses. Verified
      across all five cities, exactly **one** true same-spot dupe collapsed:
      `moore-coffee-seattle` → `moore-coffee` (99 m). The other Seattle look-alikes
      are correctly kept as distinct: `spud-fish-and-chips`/`-chips` (12.5 km
      apart — a real two-location fish-and-chips), `westmans-bagel-and-coffee`/
      `…-coffee` (1.9 km), `wing-dome`/`wingdome`/`the-wing-dome`,
      `anchorhead-coffee`/`…-co`, `lula-coffee`/`…-co`, `an-nam-pho`/`annampho`
      (all > 150 m). Seattle 2390 → **2389**.
- [x] **Better tie-break at the play-cap boundary.** Fame scores are coarse
      (0–100 integers), so many rows tie right at the cap cut (Seattle: ~90 rows at
      **fame = 44** straddling the 500th in-play slot) and id-lexicographic order
      used to decide who plays — effectively alphabetical. Fixed: `byFameRank` (in
      `apply-difficulty-lib.mjs`) now ranks by fame, then **review count** (well
      populated in the fame cache — Seattle 2499/2782 non-zero), then id. It drives
      difficulty bucketing, the play cap, and the de-dupe survivor pick, so the more
      established of two equally-famous spots is preferred over the alphabetically
      earlier one. (A richer popularity signal — see *Precise popularity filter* —
      could refine it further.)
- [ ] **Manual force-include famous OSM-untagged landmarks.** Seattle's fetch
      missed the **Fremont Troll** and **The Spheres** (tagged `tourism=artwork`/
      other, outside the `fetch-pois` allowlist). Add them (and any per-city
      equivalents) via `data/<id>-manual.json` with coords + hand-assigned
      difficulty, then re-run `apply-difficulty.mjs`. See DATA-SOURCING §4.
- [x] **Play cap per city (`City.playCap`) + non-food floor.** Every enriched
      row stays in the dataset with its `fameScore`; only the top-`playCap` by
      fame are `inPlay` and carry a difficulty (count-bucketed 40% easy / 40%
      medium / 20% hard). Caps: St. Pete 400 (396 rows, all in play), Ann Arbor
      300, State College 200, Seattle 500, Chicago 700. Daily selection filters
      to `inPlay`
      and enforces a **non-food floor** (`MIN_NON_FOOD_PER_DAY = 1`) so
      parks/landmarks aren't crowded out by food. Re-capping = re-run
      `apply-difficulty.mjs` off the committed fame cache (no re-research). See
      `docs/DATA-SOURCING.md` §4c, PLAN §5.

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
- [x] **Deploy to GitHub Pages** — DONE 2026-06-07 via
      `.github/workflows/deploy.yml`; now served at `knowyourcity.gg`.

## Later / nice-to-have
- [x] **Custom domain** — DONE 2026-06-10: `knowyourcity.gg` (Porkbun), Vite
      `base: '/'`, Pages custom domain + HTTPS. See `docs/OPERATIONS.md`.
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
- [x] **Optional backend for shared online leaderboards** — shipped (#92): the
      anonymous daily leaderboard (Cloudflare D1 worker `kyc-leaderboard`,
      `src/components/Leaderboard.tsx`, `src/lib/leaderboard.ts`), with a 90-day
      retention cron (#93). A **server-side per-player streak** (#95, migration
      `0002_create_streaks.sql`, `streaks` table) was added alongside it, keyed by
      anonymous client id and built to be accounts-ready. See PLAN §11 and
      `worker/README.md`. *Still open:* named/account-based leaderboards.

## Done
- [x] **State College enriched + uncapped + parks fix** — removed the size cap
      (`target: null` → `composeLocations` keeps everything in-bounds), re-fetched
      (80 → 282), ran the fame pass, enriched to **234** rows (the 20/45/35
      percentile split at the time gave 47 easy / 105 medium / 82 hard; PR #59's
      play-cap re-run later set the in-play split to 200 rows at 80/80/40). Also
      fixed park under-fetching in `fetch-pois` (named green spaces no longer need a
      wiki tag) → **2 → 46 parks**. Tooling: `apply-difficulty.mjs`,
      `add-or-update-city` skill, `build-city.test.mjs`, `fetch-pois.test.mjs`.
- [x] **Difficulty system (St. Pete)** — per-location easy/medium/hard from a
      fame+status web-research pass, calibrated to a human local's blind ratings;
      daily plan switched to 2 easy → 2 medium → 1 hard; St. Pete cleaned 516→382
      (401 after the +19 parks/lakes pass, PR #49; **389** after the play-cap
      re-run, PR #59; **396** after the +7 player-requested/nearby-sweep adds,
      PR #74; **395** after removing the closed DeSanto Bar, issue #81; **398**
      after +3 John's Pass adds, issue #85; **397** after removing the closed
      McAuley's Pub; **396** after a Google Places freshness sweep — re-pin 7,
      rename 4 to successors, −5 closed, +4 new). PR #40. (Rollout to other
      cities tracked under *In progress / next*.)
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
      build-city) → per-city `public/locations.<id>.json` (St. Pete 396 +
      4 cities); the app loads the selected city's file; validated by a test.
- [x] Applied Alex's decisions: 0–100 linear scoring, midnight-ET rollover,
      clues hidden by default, whole-city start zoom.
