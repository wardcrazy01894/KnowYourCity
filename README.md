<div align="center">

# 🗺️ Know Your City

**A daily "where is it?" map-guessing game for local landmarks** — like
[maptap.gg](https://maptap.gg) / GeoGuessr Daily, but for your city.

🌎 Cities: **St. Petersburg · State College · Ann Arbor · Seattle · Chicago**

[![CI](https://github.com/wardcrazy01894/KnowYourCity/actions/workflows/ci.yml/badge.svg)](https://github.com/wardcrazy01894/KnowYourCity/actions/workflows/ci.yml)
&nbsp;·&nbsp; React + TypeScript + Vite + Leaflet
&nbsp;·&nbsp; $0 to run

</div>

---

Pick a city, then each day **everyone gets the same 5 places**. You see a place's
name (e.g. _Sunken Gardens_), drop a pin on a satellite map, and score by how
close you got. Share your result Wordle-style.

- 💸 **$0 to run** — free satellite tiles, free POI data, no backend, no card.
- 🔁 **No server** — "same 5 for everyone" is computed from the date (seeded RNG).
- 🔊 **Sound feedback** — a triumphant arpeggio for a perfect 100, down to a
  womp-womp for a bad miss (🔊/🔇 to mute).
- 🧭 **Real local spots** — landmarks, restaurants, bars & cafés per city.
- 🔎 **"Is my place in the game?"** — search a city's list with autocomplete.
- 🔗 **SEO-ready** — OG/Twitter unfurl meta, sitemap, robots.txt, and JSON-LD structured data for social sharing.
- 🐛 **Report a bug** — type it in-app; a tiny serverless function files a GitHub
  issue (falls back to a prefilled issue page if not deployed). See [`worker/`](worker/).
- 🏆 **Anonymous daily leaderboard** — finish the official daily and see "you
  placed Xth of Y today", per city. No accounts, no names; optional (a Cloudflare
  D1-backed Worker). See [`worker/`](worker/).

> **Status:** **live** at <https://knowyourcity.gg/> —
> auto-deploys on every push to `main` (see [`docs/OPERATIONS.md`](docs/OPERATIONS.md)).
> Next up: more places + photos. See [`BACKLOG.md`](BACKLOG.md).

---

## 🎮 How to play

1. A place **name** appears over a satellite map of your chosen city.
2. **Click the map** where you think it is (zoom in for precision).
3. **Submit** → the real spot is revealed with your distance and score (0–100).
4. Five rounds ramping up in difficulty — **🟢 easy → 🟢 easy → 🟡 medium →
   🟡 medium → 🔴 hard** (with category variety mixed in, and at least one
   non-food spot like a 🏞️ park/landmark so it's never all restaurants) — then a
   results screen with your total /500, streak, and a copyable share. Difficulty
   = how locally famous a place is; cities not yet scored fall back to a
   ☕ coffee → 🍽️ restaurant → 🍺 bar → 🏛️ landmark → 🎲 wildcard order.

New puzzle daily at **midnight in the city's timezone**.

## 🚀 Quick start

```bash
npm install
npm run dev          # → http://localhost:5173/
```

## 🧪 Local testing

Add a query param to the URL:

| Param | Effect |
|-------|--------|
| _(none)_ | Today's 5; **progress persists** across refreshes. |
| `?reset` | Same 5, but **wipes progress every refresh** — replay one set. _(`?fresh` is an alias.)_ |
| `?shuffle` | A **brand-new random 5 every refresh** — try different sets. |
| `?date=YYYY-MM-DD` | Play a specific day's puzzle. |
| `?polygons` | **Dev verification round:** one game of _every_ polygon location in the city, so each shaded boundary can be eyeballed against the map. Off the leaderboard; stored separately so it never clobbers the daily save. |
| `?debug` | Verbose `[KYC]` logging in the console. |

🐞 **Reporting a bug?** Run **`kycDumpLogs()`** in the browser console — it prints
the full session log and copies it to your clipboard. Paste that in.

## 🗃️ Cities & datasets

Cities are defined once in [`cities.json`](cities.json) (id, name, timezone,
bounds, target size). Each city's data lives at `public/locations.<id>.json`.

```bash
npm run build-city -- seattle   # landmarks + inclusive food → public/locations.seattle.json
npm run add-polygons            # backfill park/golf footprints from OSM (all cities)
```

To **add a city**: append it to `cities.json`, then run `build-city`. Full
process — landmark notability + food/drink curation rules — in
[`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md).

**Polygon scoring:** large footprints (parks, golf courses, lakes) get a real
`polygon` so a guess anywhere inside scores 100, with distance measured from the
nearest edge outside it. `npm run add-polygons` backfills them from OpenStreetMap
and flags any large location it couldn't match in
`data/polygon-backfill-report.json`. Details in
[`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md) §4d and
[`docs/PLAN.md`](docs/PLAN.md) §5.4.

## 🛰️ Optional: sharper imagery

Works out of the box with **Esri World Imagery** (no key). For higher-zoom
**Mapbox Satellite**, copy `.env.example` → `.env.local` and add a free Mapbox
token (no credit card needed). The token **ships in the public client bundle** by
design, so **restrict it to your domain(s)** (URL restrictions) in the Mapbox
dashboard rather than relying on secrecy — see `.env.example`.

## ☁️ Deploy (GitHub Pages)

**Auto-deploy (recommended):** every push to `main` builds and publishes via
`.github/workflows/deploy.yml`, which **enables Pages itself** on first run
(`configure-pages` with `enablement: true`) — no manual Settings toggle. The
site's public client config bakes in from repo **Variables** (Settings → Secrets
and variables → Actions → Variables): `VITE_BUG_ENDPOINT`,
`VITE_TURNSTILE_SITEKEY`, optional `VITE_MAPBOX_TOKEN` (leave it unset to use the
free, keyless Esri satellite tiles), optional `VITE_LEADERBOARD_ENDPOINT` (the
anonymous daily leaderboard — unset just omits the standing line; see
`worker/README.md`), and optional `VITE_CF_BEACON_TOKEN`
(Cloudflare Web Analytics page views — see `docs/OPERATIONS.md`). If the bug vars are unset, the build still
works and the bug form falls back to a prefilled issue. (If your account blocks
API-enabling Pages, fall back to Settings → Pages → Source = GitHub Actions.)

**Manual alternative:** `npm run build && npm run deploy` pushes `dist/` to a
`gh-pages` branch (requires `.env.local` for the bug endpoint/Turnstile, and
Pages Source set to the `gh-pages` branch instead of Actions).

Site lives at `https://knowyourcity.gg/` (custom domain on GitHub Pages;
`vite.config.ts` sets `base: '/'` accordingly).

## 🛠️ Development

`main` is protected — all changes go through a PR that must pass CI
(typecheck · lint · format · **test** · secret-scan). **TDD is the rule**: write
the failing test first (`/tdd-cycle` skill). See [`CLAUDE.md`](CLAUDE.md).

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build   # the CI gate
```

## 📄 Attribution

- Location data © OpenStreetMap contributors (ODbL) and Wikidata (CC0).
- Satellite imagery © Esri / Maxar (default) or © Mapbox / Maxar (with a token).

## 📚 Docs

| File | What |
|------|------|
| [`docs/PLAN.md`](docs/PLAN.md) | Architecture, milestones, game mechanics. |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Live URL, deploy, env/Variables, worker — runbook. |
| [`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md) | How the dataset is built & curated. |
| [`docs/QUESTIONS-FOR-ALEX.md`](docs/QUESTIONS-FOR-ALEX.md) | Decisions log. |
| [`BACKLOG.md`](BACKLOG.md) | What's next (more places, photos, multi-city). |
