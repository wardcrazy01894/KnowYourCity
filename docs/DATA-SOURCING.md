# Data Sourcing — building `locations.json`

How we turn "all the stuff in St. Pete" into a curated list of **notable,
interesting** places (attractions, museums, golf courses, famous plazas,
well-known restaurants) while keeping out the mundane (laundromats, chain
salons, storage units).

The pipeline is **fetch → filter → human-curate**. A script proposes
candidates; a human makes the final `public/locations.json`. We never auto-ship
a raw scrape — curation is what makes the game good.

---

## 0. Why these sources

| Source | Cost | Key? | License | Good for |
|--------|------|------|---------|----------|
| **OpenStreetMap (Overpass API)** | free | none | ODbL (attribution + share-alike of *data*) | the bulk: POIs with coords + tags |
| **Wikidata / Wikipedia** | free | none | CC0 (public domain) | notability signal + landmark descriptions |

Both are free, no API key, no credit card. (Google Places was rejected: its ToS
forbids storing place data beyond 30 days, which a committed `locations.json`
inherently does.) See the comparison the project was scoped from.

**Licensing obligation:** the shipped app must display
`Locations © OpenStreetMap contributors` (ODbL). Wikidata-derived facts are CC0
(no attribution required, but we credit anyway). This string lives in
`locations.json.attribution` and is rendered in the app footer/about.

---

## 1. Fetch — Overpass query

Bounding box (St. Pete, **confirm with Alex**): `S 27.62, W -82.78, N 27.86, E -82.58`.

The exact query lives in `scripts/fetch-pois.mjs` → `buildOverpassQuery()`. It
requests an **allowlist** of high-signal tags only:

```overpassql
[out:json][timeout:60];
(
  nwr["tourism"~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium"](27.62,-82.78,27.86,-82.58);
  nwr["leisure"~"golf_course|park|stadium|marina"](27.62,-82.78,27.86,-82.58);
  nwr["historic"](27.62,-82.78,27.86,-82.58);
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikidata"](27.62,-82.78,27.86,-82.58);
  nwr["amenity"~"theatre|arts_centre|restaurant|bar|cafe"]["wikipedia"](27.62,-82.78,27.86,-82.58);
  nwr["building"="stadium"](27.62,-82.78,27.86,-82.58);
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

Open `data/candidates.json` and produce `public/locations.json` by hand:

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

Then set the file's top-level `attribution` and `version`, and the app picks it
up (swap `App.tsx`'s `DATA_URL` from `locations.sample.json` to `locations.json`).

> Re-running the pipeline regenerates `candidates.json`, **not**
> `locations.json` — your curation is never clobbered.

---

## 5. Future: photos
When adding photo rounds, fill `photoUrl` from a **freely-licensed** source:
- **Wikimedia Commons** (best for landmarks; CC-BY-SA / public domain) — no key.
- **Mapillary** (street-level; CC-BY-SA) — free key, patchy coverage.
- Google Street View only if you accept a billing account + its ToS.
Record the image's own attribution alongside it. No schema change needed —
`photoUrl` already exists on `Location`.
