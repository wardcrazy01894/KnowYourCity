<div align="center">

# 🗺️ Know Your Locals

**A daily "where is it?" map-guessing game for local landmarks** — like
[maptap.gg](https://maptap.gg) / GeoGuessr Daily, but for one city at a time.

🌴 First city: **St. Petersburg, FL**

[![CI](https://github.com/wardcrazy01894/KnowYourLocals/actions/workflows/ci.yml/badge.svg)](https://github.com/wardcrazy01894/KnowYourLocals/actions/workflows/ci.yml)
&nbsp;·&nbsp; React + TypeScript + Vite + Leaflet
&nbsp;·&nbsp; $0 to run

</div>

---

Each day **everyone gets the same 5 places**. You see a place's name (e.g.
_Sunken Gardens_), drop a pin on a satellite map of St. Pete, and score by how
close you got. Share your result Wordle-style.

- 💸 **$0 to run** — free satellite tiles, free POI data, no backend, no card.
- 🔁 **No server** — "same 5 for everyone" is computed from the date (seeded RNG).
- 🔊 **Sound feedback** — a triumphant arpeggio for a perfect 100, down to a
  womp-womp for a bad miss (🔊/🔇 to mute).
- 🧭 **Real local spots** — ~76 curated St. Pete landmarks, restaurants, bars &
  cafés (single-location independents only).

> **Status:** playable and feature-complete for v1. Next up: more places + a
> GitHub Pages deploy. See [`BACKLOG.md`](BACKLOG.md).

---

## 🎮 How to play

1. A place **name** appears over a satellite map of St. Pete.
2. **Click the map** where you think it is (zoom in for precision).
3. **Submit** → the real spot is revealed with your distance and score (0–100).
4. Five rounds — **☕ coffee → 🍽️ restaurant → 🍺 bar → 🏛️ landmark → 🎲 wildcard** —
   then a results screen with your total /500, streak, and a copyable share.

New puzzle daily at **midnight Eastern**.

## 🚀 Quick start

```bash
npm install
npm run dev          # → http://localhost:5173/KnowYourLocals/
```

> Vite serves under the `/KnowYourLocals/` base path (so the same build works on
> GitHub Pages) — open the full URL it prints.

## 🧪 Local testing

Add a query param to the URL:

| Param | Effect |
|-------|--------|
| _(none)_ | Today's 5; **progress persists** across refreshes. |
| `?reset` | Same 5, but **wipes progress every refresh** — replay one set. _(`?fresh` is an alias.)_ |
| `?shuffle` | A **brand-new random 5 every refresh** — try different sets. |
| `?date=YYYY-MM-DD` | Play a specific day's puzzle. |
| `?debug` | Verbose `[KYL]` logging in the console. |

🐞 **Reporting a bug?** Run **`kylDumpLogs()`** in the browser console — it prints
the full session log and copies it to your clipboard. Paste that in.

## 🗃️ Building the location dataset

```bash
npm run fetch-pois   # OpenStreetMap (Overpass) → data/candidates.json
```

Then hand-curate `data/candidates.json` into `public/locations.json`. Full
process — including the food/drink curation rules — in
[`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md).

## 🛰️ Optional: sharper imagery

Works out of the box with **Esri World Imagery** (no key). For higher-zoom
**Mapbox Satellite**, copy `.env.example` → `.env.local` and add a free Mapbox
token (no credit card needed).

## ☁️ Deploy (GitHub Pages)

```bash
npm run build
npm run deploy       # pushes dist/ to the gh-pages branch
```

Enable Pages (branch `gh-pages`) → lives at
`https://wardcrazy01894.github.io/KnowYourLocals/`.
(`vite.config.ts` already sets the correct `base`.)

## 🛠️ Development

`main` is protected — all changes go through a PR that must pass CI
(typecheck · lint · format · **test** · secret-scan). **TDD is the rule**: write
the failing test first (`/tdd-cycle` skill). See [`CLAUDE.md`](CLAUDE.md).

```bash
npm run typecheck && npm run lint && npm test && npm run build   # the CI gate
```

## 📄 Attribution

- Location data © OpenStreetMap contributors (ODbL) and Wikidata (CC0).
- Satellite imagery © Esri / Maxar (default) or © Mapbox / Maxar (with a token).

## 📚 Docs

| File | What |
|------|------|
| [`docs/PLAN.md`](docs/PLAN.md) | Architecture, milestones, game mechanics. |
| [`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md) | How the dataset is built & curated. |
| [`docs/QUESTIONS-FOR-ALEX.md`](docs/QUESTIONS-FOR-ALEX.md) | Decisions log. |
| [`BACKLOG.md`](BACKLOG.md) | What's next (more places, photos, multi-city). |
