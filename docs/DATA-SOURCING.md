# Data Sourcing — building the per-city location datasets

How we turn "all the stuff in St. Pete" into a curated list of **notable,
interesting** places (attractions, museums, golf courses, famous plazas,
well-known restaurants) while keeping out the mundane (laundromats, chain
salons, storage units).

The pipeline is **fetch → filter → human-curate**. A script proposes
candidates; a human (or `build-city`) makes the final per-city `public/locations.<id>.json`. We never auto-ship
a raw scrape — curation is what makes the game good.

---

## 0. Why these sources

| Source | Cost | Key? | License | Good for |
|--------|------|------|---------|----------|
| **OpenStreetMap (Overpass API)** | free | none | ODbL (attribution + share-alike of *data*) | the bulk: POIs with coords + tags |
| **Wikidata / Wikipedia** | free | none | CC0 (public domain) | notability signal + landmark descriptions |

Both are free, no API key, no credit card. (Google Places was rejected: its ToS
forbids storing place data beyond 30 days, which a committed dataset
inherently does.) See the comparison the project was scoped from.

**Licensing obligation:** the shipped app must display
`Locations © OpenStreetMap contributors` (ODbL). Wikidata-derived facts are CC0
(no attribution required, but we credit anyway). This string lives in
each dataset's top-level `attribution` field.

---

## 1. Fetch — Overpass query

Each city's bounding box comes from `cities.json` (the live St. Pete box is
`[27.62,-82.78,27.87,-82.58]`, used in the example below).

The landmark query lives in `scripts/fetch-pois.mjs` → `buildOverpassQuery()`. It
requests an **allowlist** of high-signal tags only:

```overpassql
[out:json][timeout:60];
(
  nwr["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium"](27.62,-82.78,27.87,-82.58);
  nwr["leisure"~"golf_course|park|stadium|marina"](27.62,-82.78,27.87,-82.58);
  nwr["historic"](27.62,-82.78,27.87,-82.58);
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikidata"](27.62,-82.78,27.87,-82.58);
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikipedia"](27.62,-82.78,27.87,-82.58);
  nwr["building"="stadium"](27.62,-82.78,27.87,-82.58);
);
out center tags;
```

Notes:
- `nwr` = nodes + ways + relations; `out center` gives ways/relations a single
  representative lat/lng (good enough for a guessing game).
- Restaurants/bars/cafés are only pulled **if they carry a `wikidata` or
  `wikipedia` tag** — that's the notability gate that keeps random eateries out
  while letting famous ones (the kind with a Wikipedia page) in.
- Run it: `npm run fetch-pois` (Node 18+, public Overpass endpoint, well under
  rate limits for a one-off). You can also paste the query into
  <https://overpass-turbo.eu> to eyeball results on a map first.

---

## 2. Filter — notability + exclusion

Implemented in `isNotable(el)` / `NAME_DENYLIST` in `fetch-pois.mjs`:

1. **Must have a `name` tag.** No name → drop.
2. **Keep if notable**, where notable means EITHER:
   - has `wikipedia=*` or `wikidata=*` (someone wrote it up → it's a real place),
     OR
   - its tag is inherently notable: `tourism=museum|attraction|gallery|zoo|
     aquarium|theme_park`, `leisure=golf_course|stadium|marina`, `historic=*`,
     `building=stadium`. (Parks are kept but are the most likely to need manual
     pruning — neighborhood pocket parks aren't interesting.)
3. **Denylist** by name regex regardless of tags: laundromat, Great Clips,
   Sport Clips, "… Wash", storage, U-Haul, etc. Extend as you spot junk.

**Wikidata cross-reference (optional enrichment):** for rows with a `wikidata`
tag, you can query the Wikidata SPARQL endpoint to pull a short description to
seed the `clue` field. Example — landmarks near St. Pete with coordinates:

```sparql
SELECT ?item ?itemLabel ?desc ?coord WHERE {
  ?item wdt:P131* wd:Q49255 ;          # located in (admin) St. Petersburg, FL
        wdt:P625 ?coord .              # has coordinates
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
```
Run at <https://query.wikidata.org>. This is optional polish — the OSM
`wikipedia`/`wikidata` tag gate already does the heavy lifting.

---

## 3. Normalize — the Location schema

`toLocation(el)` maps each kept element to:

```jsonc
{
  "id": "sunken-gardens",          // slug(name); unique; stable localStorage key
  "name": "Sunken Gardens",        // shown to player
  "lat": 27.7836,
  "lng": -82.6403,                 // el.lat/el.lon, or el.center for ways/rels
  "category": "attraction",        // inferred from tags (see types.ts)
  "clue": null,                    // HUMAN writes this (or seed from Wikidata)
  "photoUrl": null,                // FUTURE photo rounds; leave null for v1
  "source": "overpass",            // or "wikidata" / "manual"
  "attribution": "OpenStreetMap ODbL"
}
```

Output goes to `data/candidates.json`. De-dupe by `id` (same place can appear as
both a node and a way).

---

## 4. Curate — the human step (the important one)

Open `data/candidates.json` and produce a per-city `public/locations.<id>.json` (build-city automates this):

- **Delete junk** the filters missed (boring parks, duplicates, defunct places).
- **Fix display names** ("The Don CeSar", not "Don Cesar Hotel (historic)").
- **Write a one-line `clue`** for each — fun, not a giveaway.
- **Sanity-check coordinates** by spot-checking a few on the satellite map
  (especially `out center` points for big polygons like golf courses — center
  of a golf course is fine; center of a sprawling park may land oddly).
- **Force-include** Alex's must-have landmarks even if OSM tagging missed them
  (add as `"source": "manual"`).
- Aim for **≥ 60 locations** (100+ better) so daily repeats are rare — see
  PLAN.md §5.3.

Then set the file's top-level `attribution` and `version`. The app loads
`public/locations.<id>.json` for the selected city (see `cityDataUrl` in
`src/lib/cities.ts`); there is no sample fallback.

> Re-running the pipeline regenerates `candidates.json`, **not** the curated
> `locations.<id>.json` — your curation is never clobbered. (`build-city`
> regenerates a city's file in full, so keep any manual entries reproducible.)

### Status: ~516 locations
`public/locations.stpete.json` holds **~516 St. Pete places** — ~30 curated
landmarks plus an **inclusive** pull of non-national-chain restaurants/bars/cafés
in the bounding box (≈326 restaurants, **109 bars**, 50 cafés). Bars
are pulled even without an "established" tag signal (many dives carry no tags);
restaurants/cafés still require one. A few well-known bars not in OSM (Good Night
John Boy, My Rich Uncle, Welcome to the Farm) were added manually via geocoded
addresses. The box is `[27.62, -82.78, 27.87, -82.58]` — a close-in frame over
the city and inner beaches (the north edge reaches Kahuna's); the stpete `bounds`
in cities.json match it, and the in-bounds guard drops anything past it. The map
locks pan/zoom to this box, so a tighter frame deliberately trades a few far-flung
beach spots for a closer starting view.

Earlier hand-picked highlights (with clues):
- **Landmarks** (non-food): museums, Tropicana Field & venues, golf courses,
  parks (Fort De Soto, North Shore volleyball/kickball), the Don CeSar, etc.
- **Food & drink**: cafés (Bandit, ParaDeco, Central Coffee Shoppe…),
  restaurants (Brick & Mortar, Il Ritorno, Ted Peters, Chile Verde, Hawkers,
  Floribbean…), bars/breweries (Green Bench, Cycle, Emerald Bar, 3 Daughters,
  Kahuna's…). Local mini-chains are welcome; only national chains are excluded.

The daily game picks **one of each** in order: **cafe → restaurant → bar →
landmark → wildcard** (`CATEGORY_PLAN` in `src/lib/daily.ts`). A vitest guard
(`src/lib/locations.test.ts`) fails the build if a location is out of bounds, an
id collides, or the curated set can no longer fill that plan.

### Category buckets
The pipeline tags each row with a `category`. For round selection:
`cafe`, `restaurant`, `bar` are the food/drink buckets; **everything else**
(`attraction`, `museum`, `park`, `landmark`, `venue`, `golf_course`, `plaza`,
`other`) counts as a **landmark**.

### Multiple cities — `npm run build-city -- <id>`
`scripts/build-city.mjs` generates a whole city's `public/locations.<id>.json` in
one shot: it runs the landmark query (`fetch-pois` logic) and the inclusive food
query (`fetch-food` logic) for the city's bbox, then **balances** the mix
(~30% landmarks / 18% cafés / 22% bars / 30% restaurants), ranks food by the
established-business signal, dedupes, filters to in-bounds, and caps to the
city's `target`. Cities are defined once in the root `cities.json` (read by both
this script and the app via `src/lib/cities.ts`). Current cities: St. Pete (~516,
built via fetch-food + curation), State College (~80), Ann Arbor (~100),
Seattle (~200), Chicago (~200).

### Adding food/drink — `npm run fetch-food`
Independent eateries usually lack `wikipedia`/`wikidata`, so the notability-gated
`fetch-pois` misses them. `scripts/fetch-food.mjs` does an **inclusive** pull
instead: every `restaurant|bar|cafe|pub|fast_food|brewery` in the bbox that is
(a) not a genuine **national chain** (McDonald's, Starbucks… — local mini-chains
like Hawkers / 3 Daughters are kept), (b) not known-closed, and (c) has an
"established business" signal (website / hours / cuisine / phone / wikidata).
Output → `data/food-candidates.json`; merge into a per-city `public/locations.<id>.json`.

**On "≥100 Yelp reviews":** Yelp/Google review counts can't be stored in the repo
without breaking their API terms (same reason we skip Google for POIs). OSM is
ODbL (storable), so the established-business signal is the license-clean proxy. A
true review threshold would need a paid Yelp/Google integration — see BACKLOG.

Inclusion rules (current):
- **Include local mini-chains** people know (Hawkers, 3 Daughters, Datz…) —
  only genuine **national chains** are excluded (`NATIONAL_CHAIN` in
  `fetch-food.mjs`).
- **No closed spots** — `CLOSED` denylist (Sea Salt, Red Mesa, Locale…). Note:
  with an inclusive OSM pull, a few stale/closed entries can slip through; add
  any you spot to `CLOSED` and re-merge, or maintain a per-city ban list.
- Spots not yet in OpenStreetMap have no trusted coordinates and are left out
  until added to OSM (or supplied manually, like Kahuna's & 3 Daughters here).

To grow further: re-run `npm run fetch-pois`, add more from
`data/candidates.json`. The script sets a descriptive `User-Agent` and falls back
across Overpass mirrors (the public servers 406 without a UA and often return a
busy error under load).

---

## 5. Future: photos
When adding photo rounds, fill `photoUrl` from a **freely-licensed** source:
- **Wikimedia Commons** (best for landmarks; CC-BY-SA / public domain) — no key.
- **Mapillary** (street-level; CC-BY-SA) — free key, patchy coverage.
- Google Street View only if you accept a billing account + its ToS.
Record the image's own attribution alongside it. No schema change needed —
`photoUrl` already exists on `Location`.
