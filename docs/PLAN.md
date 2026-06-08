# KnowYourLocals — Implementation Plan

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
- Player drops **one pin** on a **satellite map** of St. Pete.
- Score = distance-based, GeoGuessr-style decay, retuned for city scale.
- After 5 rounds: results screen + **Wordle-style shareable** text. Streaks
  persist locally.

**Explicitly OUT of v1** (designed-for, not built): photo rounds, any backend,
shared online leaderboards, accounts, multiple cities. The data schema and a
`photoUrl` field leave clean seams for all of these.

---

## 2. Architecture at a glance

```
Browser (static site, no backend)
 ├─ public/locations.<id>.json   ← per-city curated datasets (committed)
 ├─ lib/daily.ts                 ← date → seed → pick the day's 5 (by category)
 ├─ lib/scoring.ts               ← haversine + 0–100 linear score
 ├─ lib/storage.ts               ← localStorage: streak/history/resume
 ├─ lib/devmode.ts               ← URL modes: ?reset / ?shuffle
 ├─ lib/sound.ts                 ← Web Audio score-feedback cues
 ├─ lib/log.ts                   ← console + buffered logging (kylDumpLogs)
 └─ components/
     ├─ App      → load data, resolve the day, mute toggle, render Game
     ├─ Game     → 5-round flow (guess → reveal → next → results)
     ├─ MapGuess → Leaflet + free satellite tiles, pin + reveal line
     └─ Results  → totals, streak, share string
```

No server: "same 5 for everyone" is achieved purely by seeding a PRNG with the
date string in the city's timezone (St. Pete → `America/New_York`), so two
browsers compute the identical selection offline.

### Tech stack (locked)
- **React + TypeScript + Vite**, static build.
- **Leaflet** for the map; **free satellite tiles** (Esri World Imagery default,
  optional Mapbox Satellite via free token).
- **GitHub Pages** for hosting (free). `vite.config.ts` sets
  `base: '/KnowYourLocals/'`.

---

## 3. Repo structure

```
KnowYourLocals/
├─ index.html
├─ package.json            scripts: dev, build, test, lint, fetch-pois, deploy
├─ vite.config.ts          base: '/KnowYourLocals/'
├─ tsconfig.json · eslint.config.js · .prettierrc.json
├─ .env.example            optional VITE_MAPBOX_TOKEN
├─ README.md · CLAUDE.md · BACKLOG.md
├─ public/
│   ├─ locations.<id>.json      per-city datasets (stpete, seattle, …)
│   └─ (cities.json at repo root is the city registry)
├─ scripts/
│   ├─ fetch-pois.mjs           Overpass → data/candidates.json
│   └─ protect-main.sh          (re)apply branch protection
├─ data/
│   └─ candidates.json          gitignored pipeline output (for curation)
├─ src/
│   ├─ main.tsx · App.tsx · index.css · vite-env.d.ts
│   ├─ types.ts                 Location, GameState, RoundResult, Guess…
│   ├─ lib/                     daily · scoring · storage · devmode · sound · log
│   │                           (+ co-located *.test.ts; locations.test.ts guards data)
│   └─ components/              Game · MapGuess · Results (+ Results.test.ts)
├─ .github/                     workflows/ci.yml · workflows/deploy.yml · pull_request_template.md
├─ .claude/                     settings.json · hooks/ · skills/tdd-cycle/
└─ docs/
    ├─ PLAN.md (this file)
    ├─ DATA-SOURCING.md
    └─ QUESTIONS-FOR-ALEX.md
```

---

## 4. Milestones (status)

| # | Milestone | Status |
|---|-----------|--------|
| **M0** | Scaffold: Vite+React+TS, deps, `npm run dev` | ✅ done |
| **M1** | Domain core: `types.ts`, `daily.ts`, `scoring.ts` (+ tests) | ✅ done |
| **M2** | Data pipeline + curated per-city `locations.<id>.json` (St. Pete ~516; 4 more cities) | ✅ done |
| **M3** | Map: `MapGuess` — satellite tiles, pin, reveal line, bounds | ✅ done |
| **M4** | Game flow: round → reveal → next → finished | ✅ done |
| **M5** | Persistence: resume + streak/history | ✅ done |
| **M6** | Results + Wordle-style share string | ✅ done |
| **M7** | Deploy to GitHub Pages | 🟡 self-enabling workflow shipped (`deploy.yml`); goes live on next push to `main` |

v1 is feature-complete and playable. Remaining work (grow dataset, photos,
multi-city, deploy) is tracked in `BACKLOG.md`. CI gates every PR with
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
  - **Difficulty plan** (`DIFFICULTY_PLAN`, default): when **every** location in
    the city carries a `difficulty`, the 5 rounds run **easy → easy → medium →
    medium → hard** (gentle warm-up, hardest finisher). Within each slot we *layer
    both* constraints — prefer a location of that difficulty whose **category**
    hasn't appeared yet today — so a day doesn't turn into five restaurants. If a
    difficulty bucket runs short, the slot falls back to any remaining location
    (still preferring a fresh category).
  - **Category plan** (`CATEGORY_PLAN`, legacy fallback): for cities **not yet
    enriched** with difficulty, the 5 rounds are filled by category in order —
    **cafe → restaurant → bar → landmark → wildcard** (*landmark* = anything that
    isn't a cafe/restaurant/bar; *wildcard* = any remaining). Empty buckets fall
    back to any remaining location.
  - Either way a full set of 5 is always returned. Cities are enriched one at a
    time (St. Petersburg first); see §5.3b and `docs/DATA-SOURCING.md`.

### 5.1b Difficulty (`difficulty: 'easy' | 'medium' | 'hard'`)
Each location's difficulty is the **inverse of its local fame** — how many
residents would instantly recognise it. Fame is scored 0–100 by a one-time
**agentic web-research pass** (TripAdvisor "things to do"/"best of" presence,
Google/Yelp review counts *relative to the city*, Wikipedia) and bucketed by
**city-relative percentile** so every city has enough of each tier to fill the
plan. We use a **narrow-easy split — top 20% easy / next 45% medium / bottom 35%
hard** (St. Pete only has ~10 truly iconic spots, so a wider "easy" would label
neighbourhood dives as easy; narrow-easy keeps "easy" closer to "everyone knows
it" while still leaving ~76 easy spots). Fame is calibrated to **down-weight
tourist/critic fame** (Michelin/James Beard/TripAdvisor rank, lore-only
Wikipedia) and **up-weight raw local ubiquity** — see `docs/DATA-SOURCING.md`.

### 5.2 Daily selection integrity (the honest tradeoff)
Selection is a pure function of `(dateKey, list)`. **If you edit the location
list, the shuffle changes for every date** — past and future puzzles shift.
For a friends game this is fine (nobody audits yesterday). If it ever matters,
freeze each day's chosen ids into a committed `manifest.json` and read from that
instead of reshuffling. Not worth it for v1.

### 5.3 List size vs repetition
5 unique places/day. With **N** curated locations, you can run ~`N/5` days
before a place *must* repeat, and repeats feel frequent well before that.
**Launch target per city: ~200 locations** (so repeats are rare). Food & drink
(restaurants/bars/cafés) is the bulk of each city's dataset — pulled inclusively
by `fetch-food` — alongside notable landmarks from `fetch-pois`.

### 5.3b Difficulty rollout (per city)
Difficulty is added **one city at a time** (each needs its own fame pass). A city
without it keeps the legacy category plan, so partial rollout is safe.
**Status: St. Petersburg and State College enriched; the other three pending.**
Re-run a city's pass when its dataset changes materially, and any newly-added
locations must be scored too (the percentile buckets are city-relative, so they
shift when membership changes — same tradeoff as §5.2). The pass is now driven by
the generalized, re-runnable `scripts/apply-difficulty.mjs <city>` (the St. Pete
`apply-difficulty-stpete.mjs` was the one-off original).

### 5.4 Scoring (`src/lib/scoring.ts` — implemented)
Per-round score is on a **0–100 scale** (perfect day = **500**), linear:
- ≤ **300 m** → **100**.
- ≥ **5 km** → **0**.
- between → linear falloff. Constants (`PERFECT_RADIUS_M`, `ZERO_DISTANCE_M`)
  are tunable after playtest.

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
Know Your Locals — <City>
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
- `?debug` (or `localStorage kyl:debug='1'`) enables verbose `debug` logs.

Logging (`src/lib/log.ts`): `[KYL]`-prefixed console output + an in-memory ring
buffer + uncaught-error/rejection capture. In the browser console,
`kylDumpLogs()` prints the full session log and copies it to the clipboard — the
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
http://localhost:5173/KnowYourLocals/ (Vite serves under the Pages `base`).

**GitHub Pages:**
1. `vite.config.ts` already sets `base: '/KnowYourLocals/'`.
2. **Auto-deploy** via `.github/workflows/deploy.yml` on every push to `main`.
   It **self-enables Pages** on first run (`configure-pages` `enablement: true`),
   so no manual Settings toggle. Public client config (`VITE_BUG_ENDPOINT`,
   `VITE_TURNSTILE_SITEKEY`, optional `VITE_MAPBOX_TOKEN`) is read from repo
   **Variables** so it bakes into the build; unset is fine (bug form falls back
   to a prefilled issue).
3. **Manual alternative:** `npm run deploy` (uses `gh-pages` to push `dist/` to a
   `gh-pages` branch); then set Pages Source = `gh-pages` branch instead.
4. App lives at `https://wardcrazy01894.github.io/KnowYourLocals/`. Repo is
   **public** with branch protection enforced. For a custom domain later, add a
   `CNAME` and set `base: '/'`.

---

## 9. Multi-city (implemented)
The app ships **5 cities**: St. Pete, State College, Ann Arbor, Seattle, Chicago.
A **landing picker** (`CityPicker`) chooses the city; the choice is saved
(localStorage `kyl:city` + `?city=` in the URL). Each city is data:

```
City = { id, name, short, timeZone, bounds, target }   // cities.json (+ cities.ts)
```

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
