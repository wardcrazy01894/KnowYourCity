---
name: add-location
description: Add one (or a few) specific locations to an existing city's dataset — verify open/moved status, geocode, add manual + fame records, recalibrate difficulty, and sweep the surrounding block for other missing spots. Use for player requests like "please add <venue> to <city>" (the from-app issues), or any small curated addition that doesn't warrant a full city rebuild.
argument-hint: <venue name(s)> + <city id>, e.g. "Tequila Daisy, stpete" or issue numbers
---

# Add a location (and sweep its block)

The turnkey flow for "please add X" issues. A full `add-or-update-city` rebuild
re-fetches all of OSM and churns the dataset; this flow adds curated entries
surgically. Born from issues #50/#51, where two requested venues turned out to
share a block (and an owner) with several more gaps — so the sweep in step 6 is
**mandatory**, not optional.

Read `docs/DATA-SOURCING.md` (manual entries + §4b/§4c) first if unfamiliar.

## 1. Verify the venue (web search — never trust the request or OSM alone)

- Is it real and **currently open**? (status: open/closed/renamed/uncertain)
- **Has it MOVED?** Search news ("<venue> closed", "<venue> relocat") — listing
  sites keep the old address. (Lesson: The Oyster Bar's famous 249 Central home
  closed in 2023; it reopened at 2245 Central in 2025. The right add was the
  NEW address.)
- Note review counts (Google/Yelp), category (`landmark|cafe|bar|restaurant|park`),
  and anything clue-worthy.

## 2. Geocode (best → fallback)

1. OSM/Nominatim **address-point** lookup (`https://nominatim.openstreetmap.org/search?q=<addr>&format=json`,
   send a User-Agent) — best when the house number is mapped.
2. **US Census geocoder** (`geocoding.geo.census.gov/geocoder/locations/onelineaddress`)
   — house-range interpolation, ~±30 m, good enough for the game.
3. An OSM POI node found by the sweep (step 6) already has exact coords.

Sanity-check the point lands on the right block (compare against known
neighbors in the dataset).

## 3. Check it's genuinely missing

```bash
node -e 'const d=require("./public/locations.<city>.json").locations;
  console.log(d.filter(l=>/<name-pattern>/i.test(l.name)))'
```

- Same normalized name **within ~150 m** of an existing row → it's already there
  (maybe renamed — fix the existing row instead).
- Same name **far away** → a branch of a multi-location business; adding the new
  point is correct (e.g. Five Bucks Drinkery: dataset had only the Pinellas Park
  branch, the downtown flagship was the famous one). Give it a distinct id
  (`<slug>-downtown`) and ideally OSM's distinguishing name if it has one.
- Also grep `data/fame-<city>.json`: a record with `status: closed` means the
  pipeline already researched and dropped it — don't re-add without fresh
  evidence it reopened.

## 4. Add the entry — three files, then recalibrate

1. **`data/<city>-manual.json`** (committed source of curated adds; create from
   `stpete-manual.json`'s shape if the city has none): id (kebab slug), name,
   lat, lng, category, one-sentence factual clue, `photoUrl: null`,
   `source: "manual"`, attribution noting the geocode source. Keep the array
   sorted by id. **Omit** difficulty/inPlay/fameScore — the pass assigns them.
2. **`data/fame-<city>.json`**: full 8-field record
   (`id,status,currentName,fameScore,reviewCount,hasWikipedia,isNationalChain,statusNote`).
   **Always assign a real, calibrated `fameScore` — never inherit or guess** (owner
   rule: every add/update/rename gets an accurate score). Pull the venue's
   **Google Places `userRatingCount`** (`places:searchText`, key in `.env.local`
   `GOOGLE_MAPS_KEY`) and calibrate against the city's existing fame↔reviewCount
   anchors in the cache (St. Pete: Tropicana Field 95/5000rev, 3 Daughters 72/600,
   Dead Bob's 42/300, McNasty's 22/57, 4th Street Pub 20/30; most bars/restaurants
   20–60). Down-weight tourist fame, up-weight local ubiquity. A **rename-to-
   successor is a different business** — score the new one, don't carry the old
   venue's fame. Set `reviewCount` to the Places count for provenance.
3. **`public/locations.<city>.json`**: append the same base entry (sorted by id),
   then recalibrate:

```bash
node scripts/apply-difficulty.mjs <city>
```

This re-derives difficulty city-wide from the fame cache, enforces the
`playCap` (a low-fame add can land benched — that's correct), and prints an
audit. Confirm the new ids appear enriched and nothing else changed
unexpectedly.

## 5. Tests + docs (same PR)

- `npm run typecheck && npm run lint && npm run format:check && npm test &&
npm run build` — the dataset guard test validates the new rows.
- Update the dataset counts in `docs/DATA-SOURCING.md` (status + caps lines),
  `docs/PLAN.md` (M2 row + bucket example), `BACKLOG.md`, and
  `docs/QUESTIONS-FOR-ALEX.md` if they reference the city's size.

## 6. MANDATORY: sweep the block

```bash
node scripts/nearby-sweep.mjs <city> "<lat>,<lng>"   # per added location
```

For each `MISSING` hit:

- Check `data/fame-<city>.json` first — many will be **known-closed** (OSM is
  stale; 9 of 13 around Where's Jubes were already-researched closures).
- Web-verify the rest (open/closed/moved), and add the worthy ones via this
  same flow (steps 1–5). Sweep around _those_ adds too until dry.

OSM can't surface what it doesn't have, so ALSO do one non-OSM check per
requested venue: search "what's next to <venue>" / "<owner>'s other venues" —
that's how The Crafty Squirrel and The Oyster Bar were found (same owner as
Where's Jubes, same block, neither in OSM).

## 7. PR

One PR for the batch (`feat/<city>-…`), body explaining each add + sweep
verdicts, `Closes #<issue>` per request. Commit as `wardcrazy01894` per
CLAUDE.md.
