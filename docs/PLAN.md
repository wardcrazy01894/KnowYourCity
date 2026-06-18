# KnowYourCity — Implementation Plan

A daily map-guessing game for **local** points of interest, à la
[maptap.gg](https://maptap.gg) / GeoGuessr Daily, starting with **St.
Petersburg, FL**. Hobby project, shared with friends. Free to run ($0/month, no
credit card).

> How maptap.gg actually works (researched): it shows a **text clue** and you
> tap a **3D globe** — no photos, distance-scored, 5 rounds/day, same set for
> everyone (date-seeded). We mirror that loop but for one city on a flat
> satellite map, which is more fun for local play.

---

## 1. Core concept (v1)

- Each **day** (rolling over at midnight in the city's timezone), everyone gets the **same 5 places** for that city.
- For each place we show its **name** (+ optional one-line clue). No photo yet.
- Player drops **one pin** on a **satellite map** of the chosen city.
- Score = distance-based, GeoGuessr-style decay, retuned for city scale.
- After 5 rounds: results screen + **Wordle-style shareable** text. Streaks
  persist locally.

**Explicitly OUT of v1** (designed-for, not built): photo rounds, accounts. The
data schema and a `photoUrl` field leave clean seams for these. (Multi-city was
originally deferred too, but shipped in v1 — see §9. An **anonymous daily
leaderboard** also shipped post-v1 — see §11; it adds the project's first
persistent storage, Cloudflare D1, and is built with an `user_id` seam for the
still-deferred accounts.)

---

## 2. Architecture at a glance

```
Browser (static site, no backend)
 ├─ public/locations.<id>.json   ← per-city curated datasets (committed)
 ├─ lib/daily.ts                 ← date → seed → pick the day's 5 (override or PRNG)
 ├─ lib/scoring.ts               ← 0–100 score; point + polygon branches (§5.4)
 ├─ lib/geo.ts                   ← pure geometry: point-in-polygon, edge distance, haversine
 ├─ lib/storage.ts               ← localStorage: streak/history/resume
 ├─ lib/devmode.ts               ← URL modes: ?reset / ?shuffle / ?polygons
 ├─ lib/sound.ts                 ← Web Audio score-feedback cues
 ├─ lib/log.ts                   ← console + buffered logging (kycDumpLogs)
 └─ components/
     ├─ App          → load data, resolve the day, mute toggle, render Game
     ├─ CityPicker   → landing screen: choose a city (see §9)
     ├─ Game         → 5-round flow (guess → reveal → next → results)
     ├─ MapGuess     → Leaflet + free satellite tiles, pin + reveal line
     ├─ Results      → totals, streak, share string
     ├─ DatasetSearch→ "is it in the list?" lookup (lib/search.ts)
     └─ BugReport    → in-app bug form → worker → GitHub issue (lib/report.ts)
```

No server: "same 5 for everyone" is achieved purely by seeding a PRNG with the
date string in the city's timezone (St. Pete → `America/New_York`), so two
browsers compute the identical selection offline.

### Tech stack (locked)
- **React + TypeScript + Vite**, static build.
- **Leaflet** for the map; **free satellite tiles** (Esri World Imagery default,
  optional Mapbox Satellite via free token).
- **GitHub Pages** for hosting (free), served at the custom domain
  **knowyourcity.gg** (`vite.config.ts` sets `base: '/'`).

---

## 3. Repo structure

```
KnowYourCity/
├─ index.html
├─ package.json            scripts: dev, build, test, lint, fetch-pois,
│                          fetch-food, build-city, add-polygons, deploy, …
├─ vite.config.ts          base: '/'
├─ tsconfig.json · eslint.config.js · .prettierrc.json
├─ .env.example            optional client config (Mapbox tiles, bug-report
│                          endpoint, Turnstile, CF Web Analytics)
├─ README.md · CLAUDE.md · BACKLOG.md
├─ public/
│   ├─ locations.<id>.json      per-city datasets (stpete, seattle, …)
│   ├─ favicon.svg/.ico · apple-touch-icon.png · og-image.png   icons + share image
│   ├─ robots.txt · sitemap.xml  crawler directives (guarded by seo-meta.test.ts)
│   └─ (cities.json at repo root is the city registry)
├─ scripts/
│   ├─ fetch-pois.mjs           Overpass landmarks → data/candidates.json
│   ├─ fetch-food.mjs           Overpass food/drink → data/food-candidates.json
│   ├─ build-city.mjs           assemble a city's locations.<id>.json
│   ├─ add-polygons.mjs         backfill park/golf footprint rings from OSM
│   ├─ apply-difficulty.mjs     fame → difficulty enrichment (+ -lib.mjs)
│   ├─ gen-fame-workflow.mjs · harvest-fame-transcripts.mjs   crash-safe fame pass
│   ├─ nearby-sweep.mjs         block-radius sweep around a new location
│   └─ protect-main.sh          (re)apply branch protection
├─ data/
│   ├─ fame-<city>.json         committed fame caches (re-cap without re-research)
│   ├─ stpete-manual.json       manually curated St. Pete additions
│   └─ candidates.json …        gitignored pipeline output (for curation)
├─ src/
│   ├─ main.tsx · App.tsx · index.css · vite-env.d.ts
│   ├─ types.ts                 Location, GameState, RoundResult, Guess…
│   ├─ data/
│   │   └─ dailyOverrides.ts    hand-curated daily puzzles keyed "cityId:YYYY-MM-DD"
│   ├─ lib/                     daily · scoring · storage · devmode · sound · log
│   │                           · cities · search · report · analytics
│   │                           (+ co-located *.test.ts; locations.test.ts guards data)
│   └─ components/              Game · MapGuess · Results · CityPicker ·
│                               DatasetSearch · BugReport (+ tests)
├─ worker/                      Cloudflare Workers: bug report → GitHub issue;
│                               leaderboard → D1 (leaderboard.mjs + migrations/)
├─ .github/                     workflows/ci.yml · workflows/deploy.yml · pull_request_template.md
├─ .claude/                     settings.json · hooks/ · skills/
└─ docs/
    ├─ PLAN.md (this file)
    ├─ DATA-SOURCING.md
    ├─ OPERATIONS.md
    └─ QUESTIONS-FOR-ALEX.md
```

---

## 4. Milestones (status)

| # | Milestone | Status |
|---|-----------|--------|
| **M0** | Scaffold: Vite+React+TS, deps, `npm run dev` | ✅ done |
| **M1** | Domain core: `types.ts`, `daily.ts`, `scoring.ts` (+ tests) | ✅ done |
| **M2** | Data pipeline + curated per-city `locations.<id>.json` (St. Pete 373; 4 more cities) | ✅ done |
| **M3** | Map: `MapGuess` — satellite tiles, pin, reveal line, bounds | ✅ done |
| **M4** | Game flow: round → reveal → next → finished | ✅ done |
| **M5** | Persistence: resume + streak/history | ✅ done |
| **M6** | Results + Wordle-style share string | ✅ done |
| **M7** | Deploy to GitHub Pages | ✅ done — live at <https://knowyourcity.gg/> (custom domain since 2026-06-10; auto-deploys on every merge to `main`) |

v1 is feature-complete, live, and playable. Remaining work (grow datasets,
photos, …) is tracked in `BACKLOG.md`. CI gates every PR with
typecheck/lint/format/test/secret-scan; `main` is protected (PR-only).

---

## 5. Game mechanics detail

### 5.1 Deterministic daily selection (`src/lib/daily.ts` — implemented)
- `getDateKey()` → `"YYYY-MM-DD"` for the city's timezone (`America/New_York`),
  so the puzzle rolls over at **midnight Eastern**, DST-aware (via `Intl`).
  Each future city carries its own IANA timezone.
- `hashStringToSeed(dateKey)` (cyrb53) → 32-bit seed.
- `mulberry32(seed)` → PRNG; Fisher–Yates shuffle of the **id-sorted** list.
  Same date + same list ⇒ identical picks in identical order, every browser.
  No `Math.random()`.
- **Round structure** — two plans, chosen automatically:
  - **Difficulty plan** (`DIFFICULTY_PLAN`, default): when **every in-play**
    location in the city carries a `difficulty`, the 5 rounds run **easy → easy →
    medium → medium → hard** (gentle warm-up, hardest finisher). Within each slot
    we *layer both* constraints — prefer a location of that difficulty whose
    **category** hasn't appeared yet today — so a day doesn't turn into five
    restaurants. On top of that a **non-food floor** (`MIN_NON_FOOD_PER_DAY = 1`)
    reserves a pick for a park/landmark/museum so a day is never all
    cafés/restaurants/bars — without breaking the difficulty ramp (only a non-food
    *of the slot's difficulty* is preferred). If a difficulty bucket runs short,
    the slot falls back to any remaining location (still preferring a fresh
    category).
  - **Play cap** (`City.playCap`): big/uncapped cities would otherwise be
    almost all food by fame rank. A city may cap its daily play set to the
    top-`playCap` rows by fame (`inPlay: true`), rebucketed **40% easy / 40%
    medium / 20% hard** (e.g. 500 → 200/200/100). The rest stay in the dataset as
    `inPlay: false` with their `fameScore` but **no** `difficulty`; selection
    filters them out. Current caps: St. Pete 400, Ann Arbor 300, State College
    200, Seattle 500, Chicago 700. See `docs/DATA-SOURCING.md` §4c.
  - **Category plan** (`CATEGORY_PLAN`, legacy fallback): for cities **not yet
    enriched** with difficulty, the 5 rounds are filled by category in order —
    **cafe → restaurant → bar → landmark → wildcard** (*landmark* = anything that
    isn't a cafe/restaurant/bar; *wildcard* = any remaining). Empty buckets fall
    back to any remaining location.
  - **Daily overrides** (`src/data/dailyOverrides.ts`): a hand-curated escape
    hatch — a `Record<"cityId:YYYY-MM-DD", string[]>` map of location IDs. When
    a key matches today's selection seed, `selectDailyLocations` returns those
    IDs in the given order instead of running the PRNG. Used to hand-pick a set
    for special days or to guarantee variety during a launch window. Only affects
    the matching date; all other days use the PRNG as normal. Unresolved or
    `inPlay:false` IDs in an override silently fall back to the PRNG
    (`console.warn`), so malformed entries degrade gracefully.
  - Either way a full set of 5 is always returned. Cities are enriched one at a
    time (St. Petersburg first); see §5.3b and `docs/DATA-SOURCING.md`.

### 5.1b Difficulty (`difficulty: 'easy' | 'medium' | 'hard'`)
Each location's difficulty is the **inverse of its local fame** — how many
residents would instantly recognise it. Fame is scored 0–100 by a one-time
**agentic web-research pass** (TripAdvisor "things to do"/"best of" presence,
Google/Yelp review counts *relative to the city*, Wikipedia). Every enriched
city today sets a **`playCap`** (see §5.1 and `docs/DATA-SOURCING.md` §4c), so
the live bucketing is **count-based over the in-play set — 40% easy / 40% medium
/ 20% hard** (e.g. St. Pete 373 → 149/149/75, Seattle 500 → 200/200/100). An
*uncapped* enriched city (none currently) would instead bucket by **city-relative
percentile** with a narrow-easy split — top 20% easy / next 45% medium / bottom
35% hard — keeping "easy" close to "everyone knows it" even when a city has few
true icons. Either way fame is calibrated to **down-weight tourist/critic fame**
(Michelin/James Beard/TripAdvisor rank, lore-only Wikipedia) and **up-weight raw
local ubiquity** — see `docs/DATA-SOURCING.md`.

### 5.2 Daily selection integrity (the honest tradeoff)
Selection is a function of `(dateKey, list, overrides)`. For most days the
`overrides` map has no entry and selection is purely deterministic from
`(dateKey, list)`. **If you edit the location list, the PRNG shuffle changes for
every non-overridden date** — past and future puzzles shift. For a friends game
this is fine (nobody audits yesterday). If it ever matters, freeze each day's
chosen ids into a committed `manifest.json` and read from that instead of
reshuffling. Not worth it for v1.

### 5.3 List size vs repetition
5 unique places/day. With **N** curated locations, you can run ~`N/5` days
before a place *must* repeat, and repeats feel frequent well before that.
**Launch target per city: ~200 locations** (so repeats are rare). Food & drink
(restaurants/bars/cafés) is the bulk of each city's dataset — pulled inclusively
by `fetch-food` — alongside notable landmarks from `fetch-pois`.

### 5.3b Difficulty rollout (per city)
Difficulty is added **one city at a time** (each needs its own fame pass). A city
without it keeps the legacy category plan, so partial rollout is safe.
**Status: all 5 cities enriched — St. Petersburg, State College, Ann Arbor,
Seattle, and Chicago. The difficulty rollout is complete.**
Re-run a city's pass when its dataset changes materially, and any newly-added
locations must be scored too (the percentile buckets are city-relative, so they
shift when membership changes — same tradeoff as §5.2). The pass is now driven by
the generalized, re-runnable `scripts/apply-difficulty.mjs <city>` (it generalizes
an earlier St. Pete-only one-off pass, since removed).

### 5.4 Scoring (`src/lib/scoring.ts` — implemented)
Per-round score is on a **0–100 scale** (perfect day = **500**), with a linear
falloff between a "perfect radius" and **`ZERO_DISTANCE_M`** (5 km → 0).
`scoreForDistance(distanceMeters, perfectRadiusM)` is the pure core;
`scoreGuess(location, guess)` picks the radius per location and returns
`{ distanceMeters, score }`. There are **four branches**:

1. **Polygon + inside** — a guess inside `location.polygon` scores **100** with
   `distanceMeters: 0` ("0 m" is honest: you were inside the shape).
2. **Polygon + outside** — distance is measured to the **nearest polygon edge**
   (not the centroid), and the falloff starts **at the edge** (perfect radius 0):
   even 1 m outside is < 100. No freebie ring outside a polygon.
3. **Point + large-footprint category, no polygon** (`park`/`golf_course` that
   wasn't matched/kept by the backfill) — centroid distance with the legacy
   **`LARGE_FALLBACK_RADIUS_M`** (300 m) freebie, so a dropped park doesn't
   regress. These should be resolved via the §4d backfill report, not left.
4. **Point + normal category** — centroid distance with the tightened
   **`POINT_PERFECT_RADIUS_M`** (100 m) freebie. Polygons removed the need for
   the old generous 300 m point radius.

Polygon geometry is computed by pure helpers in **`src/lib/geo.ts`**
(`pointInPolygon` ray-cast with inclusive boundary, `distanceToPolygonMeters`
via a local equirectangular projection, `haversineMeters`, `douglasPeucker`).
Footprints are backfilled offline by **`scripts/add-polygons.mjs`** (see
DATA-SOURCING.md §4d) and shaded on the map at reveal (`MapGuess`). All radius
constants are tunable after playtest.

**Polygon coverage: all five cities are complete.** Every in-play
`park`/`golf_course` either has a polygon or is deliberately point-only —
buildings, sub-features smaller than the freebie radius, and no-single-footprint
entities — recorded with a reason in **`data/point-only-by-design.json`** and
guarded by a completeness test in `src/lib/locations.test.ts`.

### 5.5 Round flow (`Game`)
`guessing` → submit → `revealed` (truth marker + distance line) → next →
… → `finished` → `Results`. Resume mid-day from localStorage if the player
reloads.

### 5.6 Persistence (`storage.ts`)
`localStorage` key namespaced with `STORAGE_VERSION`. Stores in-progress game
(to resume), `history[]`, and `streak`. **Load must tolerate old/corrupt data**
and fall back to defaults — never throw on read, or a schema bump bricks
returning players.

### 5.7 Share string (`Results.buildShareString`, pure)
```
Know Your City — <City>
2026-06-06 · 428/500
🟩🟩🟩🟨⬛
```
Emoji tiers by round score on the 0–100 scale (🟩≥80 🟨≥50 🟧≥20 ⬛<20). No
coordinates → no spoilers. Copied via `navigator.clipboard`.

### 5.8 Clues
Each location has an optional one-line `clue`. **Hidden by default** in v1
(`SHOW_CLUES = false` in `Game.tsx`) for more challenge; kept in the data so it
can be toggled on or made a per-game setting later.

### 5.9 Local testing & logging
URL params (all client-side, no build flags; see `src/lib/devmode.ts`):
- _(none)_ — normal: today's 5, progress persists.
- `?reset` (alias `?fresh`) — same 5 for the day, wipe progress every refresh.
- `?shuffle` (alias `?random`) — a brand-new random 5 every refresh.
- `?date=YYYY-MM-DD` — play a specific day's puzzle.
- `?polygons` — dev verification round: every polygon location in the city in
  one game (sorted by id), so each shaded boundary can be checked against the
  map. See `selectPolygonLocations` in `daily.ts`.

**Storage isolation.** Only the official daily writes the real per-city save
(`<city>`). Every non-official mode is namespaced so it can't bump the real
streak/history or clobber an in-progress daily: `?shuffle` → `<city>__shuffle`,
`?date=` → `<city>__date`, `?polygons` → `<city>__polygons` (see
`resolveMode` in `src/lib/mode.ts`). A startup reset is likewise scoped to the
active mode's namespace — `?reset`/`?fresh` clear the official daily (replay it
fresh), while `?shuffle` clears only its own scratch.
- `?debug` (or `localStorage kyc:debug='1'`) enables verbose `debug` logs.

Logging (`src/lib/log.ts`): `[KYC]`-prefixed console output + an in-memory ring
buffer + uncaught-error/rejection capture. In the browser console,
`kycDumpLogs()` prints the full session log and copies it to the clipboard — the
intended way to capture a repro and hand it to a developer.

### 5.10b Utilities: dataset search + bug report
- **Dataset search** (`DatasetSearch` + `src/lib/search.ts`): pick a city, type a
  name, and see if it's in that city's list (autocomplete via `searchLocations`,
  exact check via `isIncluded`). Reachable from the picker and the game header.
- **Report a bug** (`BugReport` + `src/lib/report.ts`): an in-app form — type
  what broke, hit send. If `VITE_BUG_ENDPOINT` is set it POSTs to a serverless
  function (`worker/`, a Cloudflare Worker holding the GitHub token) that **files
  a GitHub issue** with city/date/URL/browser + session logs attached. If not
  configured, it falls back to opening a prefilled GitHub issue page. The token
  is never in the client bundle. The worker is hardened for a public endpoint:
  defangs `@mentions`/code-fences, Origin allowlist, payload caps, optional
  Cloudflare Turnstile + per-IP KV rate limit. Go-live checklist in
  `worker/README.md`.

### 5.10 Sound feedback
On each reveal, `playScoreSound(score)` (`src/lib/sound.ts`) plays a synthesized
cue by tier — **perfect** (100): bright arpeggio; **good** (green, ≥80): rising
chime; **mid** (yellow, ≥50): single note; **womp** (<50): descending womp-womp.
Sounds are generated with the Web Audio API (no audio files to bundle/license),
created on the submit click (satisfies browser autoplay rules). A 🔊/🔇 header
toggle mutes them (persisted in `localStorage`). `scoreTier` is pure + tested.

### 5.11 Strong-finish celebration
When the results screen mounts after a strong day it fires a one-shot
celebration: a confetti shower (`fireConfetti`, `src/lib/confetti.ts`, via
`canvas-confetti`) plus a crowd cheer (`playCheer`, `src/lib/sound.ts`). It
triggers when `shouldCelebrate(results, totalScore)` (`src/lib/celebrate.ts`,
pure + tested) is true — i.e. **4+ greens** (rounds ≥80, same tier as the 🟩 bar)
**or a total over 400** (of 500). A `useRef` guard in `Results` makes it fire
exactly once even under React StrictMode's dev double-mount.

Confetti is a big lower-centre pop followed by ~2s of side-cannon shower (the
shower is skipped under `prefers-reduced-motion`, but the pop still shows so the
moment is always acknowledged). It's visual, so it ignores the mute toggle;
`canvas-confetti` renders its own fixed, `pointer-events:none` canvas and removes
it when done, so it never blocks the results card or leaderboard. The cheer is a
short **CC0 / public-domain** applause clip (`src/assets/cheer.mp3`, BigSoundBank)
played via a reused `Audio` element and gated by mute like the round cues — real
recorded applause reads better than synthesis, which is why this one feature is
the exception to the otherwise file-free Web Audio approach in §5.10.

Append **`?celebrate`** to the URL to force the celebration on the results screen
regardless of score, for previewing/tuning (`isCelebrateTest`, `src/lib/devmode.ts`).

---

## 6. Map integration (`MapGuess`)

- **Tiles (free):**
  - **Default — Esri World Imagery**, no API key. Required attribution:
    `Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS
    User Community`. Native max zoom ≈ **19** → set `maxNativeZoom={19}`,
    `maxZoom={19}` (optionally let Leaflet overzoom to 20 by upscaling).
    Honesty note: Esri World Imagery is widely used in Leaflet via its public
    ArcGIS REST endpoint and is fine for a hobby project with attribution, but
    it is **not** a contractually "use it however" tile service — the sanctioned
    fallback if that ever becomes a concern is Mapbox.
  - **Optional — Mapbox Satellite** when `VITE_MAPBOX_TOKEN` is set: sharper,
    zoom to 22. Free tier, no credit card; token is public in the bundle, so
    restrict it by URL in the Mapbox dashboard.
- **Bounds:** each city's `bounds` (from `cities.json`) is passed to `MapGuess`
  as `maxBounds`, and `minZoom` is locked to the fit-to-bounds view, so players
  can't pan or zoom out past the city box.
- **Interaction:** click to place/move one pin; "Submit" freezes it. On reveal,
  draw the truth marker + a polyline to the guess, labelled with the distance.

### Anti-cheat (deliberate non-goal)
The answers ship in the per-city `locations.<id>.json` and are readable in devtools. For a friends
game this is **acceptable and intentional** — we will not add obfuscation
theater. If a public competitive version ever needs it, that requires a backend
that withholds coordinates until after submit (future work).

---

## 7. Map key handling
- Esri path needs **no key** → the app always works out of the box.
- Mapbox path: copy `.env.example` → `.env.local` (gitignored), set
  `VITE_MAPBOX_TOKEN`. `MapGuess` reads `import.meta.env.VITE_MAPBOX_TOKEN` and
  picks Mapbox when present, else Esri. Never commit `.env.local`.

---

## 8. Deployment

**Local dev:** `npm install` then `npm run dev` →
http://localhost:5173/ (the site serves from the root — `base: '/'`).

**GitHub Pages:**
1. `vite.config.ts` sets `base: '/'` (custom domain serves from the root).
2. **Auto-deploy** via `.github/workflows/deploy.yml` on every push to `main`.
   It **self-enables Pages** on first run (`configure-pages` `enablement: true`),
   so no manual Settings toggle. Public client config (`VITE_BUG_ENDPOINT`,
   `VITE_TURNSTILE_SITEKEY`, optional `VITE_MAPBOX_TOKEN`, optional
   `VITE_CF_BEACON_TOKEN` for Cloudflare Web Analytics) is read from repo
   **Variables** so it bakes into the build; unset is fine (bug form falls back
   to a prefilled issue; analytics is a no-op).
3. **Manual alternative:** `npm run deploy` (uses `gh-pages` to push `dist/` to a
   `gh-pages` branch); then set Pages Source = `gh-pages` branch instead.
4. App lives at `https://knowyourcity.gg/` (custom domain configured in repo
   Settings → Pages; DNS is an ALIAS at Porkbun → `wardcrazy01894.github.io`).
   Repo is **public** with branch protection enforced.

---

## 9. Multi-city (implemented)
The app ships **5 cities**: St. Pete, State College, Ann Arbor, Seattle, Chicago.
A **landing picker** (`CityPicker`) chooses the city; the choice is saved
(localStorage `kyc:city` + `?city=` in the URL). Each city is data:

```
City = { id, name, short, timeZone, bounds, target, playCap? }   // cities.json (+ cities.ts)
```

(`target` caps the raw fetch — `null` = uncapped; `playCap` caps the daily play
set after enrichment — see §5.1 and `docs/DATA-SOURCING.md` §4c.)

- Data per city: `public/locations.<id>.json`, generated by
  `npm run build-city -- <id>` (landmarks + inclusive food, balanced + capped to
  `target`). Single source of truth `cities.json` is read by both the app
  (`src/lib/cities.ts`) and the build script.
- The engine is city-agnostic: `getDateKey(now, city.timeZone)`,
  `selectDailyLocations(list, "<id>:<date>")`, and `MapGuess`/`Game` take the
  city's `bounds`. Streaks/history are namespaced per city in localStorage.
- To add a city: append to `cities.json`, run `npm run build-city -- <id>`.

## 10. Decisions & open items
Resolved decisions are recorded in `docs/QUESTIONS-FOR-ALEX.md`. Still open:
must-include / banned lists per city, and growing each city to ~200 places.

## 11. Anonymous daily leaderboard (shipped post-v1)

Each finished **official** daily challenge tells the player where they placed:
"🏆 You placed 3rd of 47 today" (+ "top X%" once the field is ≥ 20). Anonymous —
**no accounts, no names, no PII** — and **independent per city** (a 500 in State
College is never ranked against a 415 in St. Pete).

### Architecture
This is the project's **first persistent storage**. A second Cloudflare Worker
(`worker/leaderboard.mjs`, deployed from `worker/wrangler.leaderboard.toml`)
fronts a **Cloudflare D1** (serverless SQLite) table:

```
scores(city, date, client_id, score, user_id NULL, created_at, updated_at,
       PRIMARY KEY(city, date, client_id))   + INDEX(city, date, score)
```

- `city` is part of the **primary key**, so leaderboards are independent by
  construction (not just a filtered query).
- Rank = `COUNT(*) WHERE city=? AND date=? AND score > stored`; ties share a rank
  (standard competition ranking), `rank = better + 1`. UPSERT keeps the **max**
  score, so a replay can't lower it and is idempotent.
- Two routes on the one worker: **POST** submits a score → `{rank, total}`;
  **GET** `?city=&date=` views the board → `{total, scores[]}` (top 100, desc,
  **scores only — no ids/names**). The "🏆 View leaderboard" button on the
  results screen opens it; the client assigns display ranks (ties share a rank)
  and highlights the viewer's own row. The GET is rate-limited like the POST and
  city/date-validated; the row cap keeps the anonymous list from being scraped
  wholesale.
- **D1 over KV/Durable Objects:** the rank query is a one-line indexed `COUNT`,
  `batch()` is atomic, and the relational shape is the natural home for the
  future accounts table. KV can't rank without scanning; a DO-per-day is overkill
  and complicates cross-day/account queries.

### Identity & the accounts seam
Identity is an anonymous random UUID minted in `localStorage` (`kyc:clientId`) —
the seam a future login would link to via the reserved `scores.user_id` column
(NULL today). Honest caveat: that migration is **lossy** — a player who cleared
localStorage has no `client_id` to reattach, so some pre-account history can't be
linked. Accepted tradeoff of anonymous-first.

### Per-player streak (server-side, accounts-ready)
On each official submission the worker advances a **consecutive-day streak** for
`(city, client_id)` in its own `streaks` table (migration `0002`) and returns
`{ current, best }` in the response; the results screen shows the **server**
streak when present, falling back to the existing local streak when the
leaderboard is off. Kept in a separate table (not derived from `scores`) so a
long streak **survives the 90-day retention prune**. Same logic as the client's
nextStreak (same-day replay = no change, previous-day = +1, any gap = reset to 1)
and the same accounts seam — keyed by the anonymous device id with a reserved
NULL `user_id`, per city. Best-effort: a streak hiccup never fails the score
submission.

### Integrity (only the official challenge counts)
The client (`src/lib/leaderboard.ts`) submits **only** the official daily
challenge — `resolveMode` (`src/lib/mode.ts`) sets `official: true` only for today's date-seeded
set; **shuffle (`?shuffle`) and date overrides (`?date=`) never submit**, so the
board isn't polluted by results from a different set of places. Defence in depth,
the worker independently **rejects unknown cities** and any **date outside a
±1-day window** of the city-local "today" (it recomputes the date itself from an
inlined `CITY_TZ` map — keep it in step with `cities.json`).

**Anti-cheat remains a non-goal** (§6): scores are client-computed, so a
determined actor can POST a fake total or inflate the "of Y" denominator. v1
mitigates with a per-IP rate limit (worker fails closed without one) and accepts
the residual; Turnstile is plumbed through and documented as the next step
(`worker/README.md`) if abuse appears.

### Retention (bounded storage)
Old daily boards have no value once the day passes, so a **Cloudflare Cron
Trigger** on the worker (`scheduled` handler, daily 05:00 UTC) prunes `scores`
rows older than **`RETENTION_DAYS` (90)**. This keeps the table bounded forever
regardless of traffic (even 50k players/day stays well within D1 limits), at no
extra cost. The prune touches **only** `scores` — never the per-player streak
table — so a long streak survives even after its early daily rows age out.

### Graceful + optional
Everything is behind `VITE_LEADERBOARD_ENDPOINT`. Unset, offline, a non-official
game, or any error → the standing line is simply omitted; the game never blocks.
The returned `{rank,total}` is cached under `kyc:lb:v1:<city>:<date>` so a reload
doesn't re-POST (and the UPSERT is idempotent if one races through). Local-first
testing flow (local D1, `wrangler dev`) is in `worker/README.md`.
