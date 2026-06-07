# Know Your Locals

A daily "where is it?" map-guessing game for **local** landmarks — like
[maptap.gg](https://maptap.gg) / GeoGuessr Daily, but for one city at a time.
First city: **St. Petersburg, FL**.

Each day everyone gets the **same 5 places**. You see a place's name (e.g.
*Sunken Gardens*), drop a pin on a satellite map where you think it is, and get
scored by how close you were. Share your result Wordle-style.

- **$0 to run** — free satellite tiles, free POI data, no backend, no credit card.
- **No server** — "same 5 for everyone" is computed from the date (seeded RNG).
- **Sound feedback** — a synthesized cue on each guess (a triumphant arpeggio for
  a perfect 100, down to a womp-womp for a bad miss); 🔊/🔇 toggle to mute.
- Built with **React + TypeScript + Vite + Leaflet**.

> Status: **playable**. A full 5-round daily game runs on the sample data —
> satellite map, pin-drop guessing, distance scoring, reveal, end-of-day results
> with a Wordle-style share string, and streaks saved locally. Next up is the
> real St. Pete dataset (the `fetch-pois` pipeline is still a stub). See
> [`docs/PLAN.md`](docs/PLAN.md) for the plan, [`BACKLOG.md`](BACKLOG.md) for
> what's next, and [`docs/QUESTIONS-FOR-ALEX.md`](docs/QUESTIONS-FOR-ALEX.md) for
> decisions I need from you.

## Quick start

```bash
npm install
npm run dev          # → http://localhost:5173/KnowYourLocals/
```

Vite serves under the `/KnowYourLocals/` base path (so the same build works on
GitHub Pages) — use the full URL it prints. The app loads
`public/locations.json` (curated St. Pete landmarks), falling back to the small
bundled sample if it's missing.

## Local testing

Handy URL params (client-side only):

| Param | Effect |
|-------|--------|
| _(none)_ | Normal: today's 5; **progress persists** across refreshes. |
| `?reset` | Same 5 for the day, but **wipes progress every refresh** so you restart from the beginning (replay the same set). |
| `?shuffle` | A **brand-new random 5 every refresh** — keep trying different sets. |
| `?date=YYYY-MM-DD` | Play a specific day's puzzle (persists). |
| `?debug` | Verbose `debug` logging in the console. |

So: open `…/KnowYourLocals/?reset` to debug one fixed set restarting each refresh,
or `…/KnowYourLocals/?shuffle` to get fresh spots each refresh. `?fresh` is an
alias of `?reset`.

Debugging: every session logs to the console with a `[KYL]` prefix. Run
**`kylDumpLogs()`** in the browser console to print the full session log and copy
it to your clipboard — paste that when reporting an issue. Production builds
never auto-reset (only `?fresh`/`?reset` do).

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
