# Know Your Locals

A daily "where is it?" map-guessing game for **local** landmarks — like
[maptap.gg](https://maptap.gg) / GeoGuessr Daily, but for one city at a time.
First city: **St. Petersburg, FL**.

Each day everyone gets the **same 5 places**. You see a place's name (e.g.
*Sunken Gardens*), drop a pin on a satellite map where you think it is, and get
scored by how close you were. Share your result Wordle-style.

- **$0 to run** — free satellite tiles, free POI data, no backend, no credit card.
- **No server** — "same 5 for everyone" is computed from the date (seeded RNG).
- Built with **React + TypeScript + Vite + Leaflet**.

> Status: scaffolded. The deterministic core (daily selection, scoring) and all
> types are implemented; the map, game flow, results, and data pipeline are
> stubbed. See [`docs/PLAN.md`](docs/PLAN.md) for the full plan and milestones,
> and [`docs/QUESTIONS-FOR-ALEX.md`](docs/QUESTIONS-FOR-ALEX.md) for decisions
> I need from you.

## Quick start

```bash
npm install
npm run dev          # → http://localhost:5173
```

The app loads `public/locations.sample.json` (5 real St. Pete landmarks) so it
runs before the full dataset exists.

## Build the location dataset

```bash
npm run fetch-pois   # queries OpenStreetMap → data/candidates.json
```

Then hand-curate `data/candidates.json` into `public/locations.json` (delete
junk, write clues, fix names). Full process in
[`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md).

## Optional: sharper satellite imagery

Works out of the box with **Esri World Imagery** (no key). For higher-zoom
**Mapbox Satellite**, copy `.env.example` → `.env.local` and add a free Mapbox
token (no credit card needed).

## Deploy (GitHub Pages)

```bash
npm run build
npm run deploy       # pushes dist/ to the gh-pages branch
```

Then enable Pages (branch `gh-pages`) → lives at
`https://wardcrazy01894.github.io/KnowYourLocals/`.
(`vite.config.ts` already sets the correct `base`.)

## Attribution

- Location data © OpenStreetMap contributors (ODbL) and Wikidata (CC0).
- Satellite imagery © Esri / Maxar (default) or © Mapbox / Maxar (if token set).

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — architecture, milestones, mechanics.
- [`docs/DATA-SOURCING.md`](docs/DATA-SOURCING.md) — how the dataset is built.
- [`docs/QUESTIONS-FOR-ALEX.md`](docs/QUESTIONS-FOR-ALEX.md) — open decisions.
