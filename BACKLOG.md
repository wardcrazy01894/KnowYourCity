# Backlog

Ordered by priority. Each item ships as its own PR through the protected `main`
flow (CI green → squash-merge → branch auto-deleted). See `CLAUDE.md`.

## In progress / next
- [ ] **Difficulty rollout — 1 city left.** St. Pete (PR #40), **State
      College**, **Ann Arbor**, and **Seattle** SHIPPED: every location has an
      `easy`/`medium`/`hard` `difficulty` (inverse of local fame, from a
      fame+status web-research pass), and the daily game runs **2 easy → 2 medium →
      1 hard** (layering category variety). **Chicago still uses the
      legacy cafe→…→wildcard plan** until it gets its own pass (needs 1M-context
      subagent credits enabled, OR a standard-context session — see memory
      `subagents-need-standard-context`). Use the **`add-or-update-city` skill** —
      it runs the whole flow. See `docs/PLAN.md` §5.1b/§5.3b,
      `docs/DATA-SOURCING.md` §4b, and memory `difficulty-rating-research`.
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
      **389** (all in play — the cap is 400).
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
- [ ] **Collapse same-business alternate-slug dupes in the pipeline.** Inclusive
      OSM pulls double-list a few businesses under near-identical names but
      different slugs. Seattle examples: `wing-dome`/`wingdome`/`the-wing-dome`
      (3 nodes — but at distinct coords, likely a real multi-location chain to
      KEEP), `anchorhead-coffee`/`…-co` and `lula-coffee`/`…-co` (distinct
      addresses), `moore-coffee`/`moore-coffee-seattle` (≈80 m apart — a true
      same-spot dupe to COLLAPSE), `an-nam-pho`/`annampho`, `spud-fish-and-chips`
      variants, `westmans-bagel`-`and`/`&` variants. `apply-difficulty.mjs` only
      de-dupes by exact id, so these slip through. Add a **name+proximity**-aware
      de-dupe (same normalized name AND within ~100 m → keep higher fame;
      different coords → keep both as genuine branches) to
      `composeLocations`/`apply-difficulty-lib` (TDD). Affects all cities.
- [ ] **Better tie-break at the play-cap boundary.** Fame scores are coarse
      (0–100 integers), so many rows tie right at the cap cut and id-lexicographic
      order decides who plays. Seattle is the worst case: **87 rows tie at
      fame = 44** straddling the 500th in-play slot (1 in, 86 out) — the boundary is
      effectively alphabetical. It's deterministic and there's no fame *inversion*
      (integrity holds), but the cut is arbitrary among equals. If finer ranking
      matters, add a secondary signal (review count, category, wiki presence) to the
      sort comparator in `assignCappedDifficulty`. Needs the precise-popularity data
      above to be worthwhile.
- [ ] **Manual force-include famous OSM-untagged landmarks.** Seattle's fetch
      missed the **Fremont Troll** and **The Spheres** (tagged `tourism=artwork`/
      other, outside the `fetch-pois` allowlist). Add them (and any per-city
      equivalents) via `data/<id>-manual.json` with coords + hand-assigned
      difficulty, then re-run `apply-difficulty.mjs`. See DATA-SOURCING §4.
- [x] **Play cap per city (`City.playCap`) + non-food floor.** Every enriched
      row stays in the dataset with its `fameScore`; only the top-`playCap` by
      fame are `inPlay` and carry a difficulty (count-bucketed 40% easy / 40%
      medium / 20% hard). Caps: St. Pete 400 (389 rows, all in play), Ann Arbor
      300, State College 200, Seattle 500. Daily selection filters to `inPlay`
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
      re-run, PR #59). PR #40. (Rollout to other cities tracked under *In progress /
      next*.)
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
      build-city) → per-city `public/locations.<id>.json` (St. Pete 389 +
      4 cities); the app loads the selected city's file; validated by a test.
- [x] Applied Alex's decisions: 0–100 linear scoring, midnight-ET rollover,
      clues hidden by default, whole-city start zoom.
