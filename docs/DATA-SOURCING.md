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
  nwr["leisure"~"golf_course|park|stadium|marina|nature_reserve|garden|dog_park|recreation_ground"](27.62,-82.78,27.87,-82.58);
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
- Run it: `npm run fetch-pois` (needs Node 18+ for global `fetch` — the app
  build/CI itself runs Node 22; public Overpass endpoint, well under rate limits
  for a one-off). You can also paste the query into
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
  "difficulty": "easy",            // easy|medium|hard; added by the fame pass (§4b). Optional until enriched
  "inPlay": true,                  // in the daily play set? Added by the play cap (§4c); absent = in play
  "fameScore": 92,                 // 0–100 city-relative fame; added by the fame pass (§4b/§4c)
  "clue": null,                    // HUMAN writes this (or seed from Wikidata)
  "photoUrl": null,                // FUTURE photo rounds; leave null for v1
  "polygon": [[27.78, -82.64], …], // OPTIONAL footprint ring (park/golf only); see §4d
  "source": "overpass",            // or "wikidata" / "manual"
  "attribution": "OpenStreetMap ODbL",
  "lastVerified": "2026-06-16"     // OPTIONAL date open-status last confirmed via Google Places
}
```

`polygon` is an **open** ring of `[lat, lng]` pairs (first point NOT repeated at
the end), 5-decimal precision, ≤ 100 nodes. Present only on large-footprint
rows (`category: "park" | "golf_course"`); see §4d. When set, a guess inside the
ring scores a perfect 100 and the distance is measured from the nearest polygon
edge for guesses outside it (see PLAN.md §scoring).

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

**Adding one venue** (e.g. a player request from the in-app bug reporter): use
the `add-location` skill — it verifies open/moved status, geocodes, writes the
`data/<city>-manual.json` + `data/fame-<city>.json` records, recalibrates via
`apply-difficulty.mjs`, and then runs **`scripts/nearby-sweep.mjs <city>
"<lat>,<lng>"`** to list named OSM POIs on the surrounding block that the
dataset is missing (cross-checked by normalized name + 150 m proximity, the
pipeline's dupe rule). Sweep hits must be web-verified before adding — OSM is
stale (most "missing" hits around a downtown block turn out to be
already-known closures recorded in the fame cache).

### Status: 374 locations (after the fame pass cleanup + parks/lakes + play-cap re-run)
`public/locations.stpete.json` holds **373 St. Pete places** (peaked at 401 after
the +19 parks/lakes pass; the play-cap re-run, §4c/PR #59, re-deduped to 389; +7
player-requested/nearby-sweep adds; −1 closed bar removed via issue #81; +3
John's Pass Village adds; −1 closed McAuley's Pub removed; a Google Places
freshness sweep then re-pinned 7 relocated venues, renamed 4 to their current
successor business, removed 5 truly-closed, and added 4 new spots (net −1); then
−22 national chains that had leaked past the original fame pass (Bob Evans,
Chili's, Ruth's Chris, Scooter's Coffee, Quaker Steak & Lube, …); then a
whole-fleet Google Places freshness sweep removed 4 newly-closed (Boardwalk
Tavern, Hops 2.0, Que Pasa, Liquid Therapy Bar) and added 3 successors at those
spots (Perry's Porch, China Crossings, Whiskey on Park) → **373**, all in play,
since the cap is 400). It started at ~516
from the inclusive pull below, then the fame+status pass (§4b) **removed 133** —
104 permanently-closed, 28 zero-web-presence junk entries (generic OSM nodes like
"Cafe"/"Hookah"), 1 renamed-to-also-closed — **renamed 15** still-operating spots
(e.g. The State Theatre → Floridian Social Club) and de-duped 1. The original
inclusive composition was ~30 curated
landmarks plus an **inclusive** pull of non-national-chain restaurants/bars/cafés
in the bounding box (≈326 restaurants, **109 bars**, 50 cafés). Bars
are pulled even without an "established" tag signal (many dives carry no tags);
restaurants/cafés still require one. A few well-known bars not in OSM (Good Night
John Boy, My Rich Uncle, Welcome to the Farm) were added manually via geocoded
addresses. The box is `[27.62, -82.79, 27.87, -82.58]` — a close-in frame over
the city and inner beaches (the north edge reaches Kahuna's, the west edge now
includes John's Pass Village); the stpete `bounds` in cities.json match it, and
the in-bounds guard drops anything past it. The map
locks pan/zoom to this box, so a tighter frame deliberately trades a few far-flung
beach spots for a closer starting view.

**Parks/lakes pass (+19).** Player "please add" reports (GitHub issues) surfaced a
gap: the dataset had only 6 parks and zero lakes, badly under-representing St.
Pete's public green space. A one-off, idempotent curation script added the 6
requested places —
Williams Park, Mirror Lake, Crescent Lake Park, Fossil Park, Bartlett Park, and
Rec Dec (a Gandy sports bar; the report's "rec deck") — plus 13 other notable
parks/lakes (the Straub parks, Demens Landing, Albert Whitted, Lake Maggiore,
Sawgrass Lake, Maximo, Clam Bayou, etc.). Coordinates are from OSM Nominatim;
difficulty is hand-assigned and embedded in `data/stpete-manual.json` too, so a
future `build-city` rebuild preserves it. Lakes use the `park` category (there is
no `lake` bucket). Parks are now 24.

Earlier hand-picked highlights (with clues):
- **Landmarks** (non-food): museums, Tropicana Field & venues, golf courses,
  parks (Fort De Soto, North Shore volleyball/kickball), the Don CeSar, etc.
- **Food & drink**: cafés (Bandit, ParaDeco, Central Coffee Shoppe…),
  restaurants (Brick & Mortar, Il Ritorno, Ted Peters, Chile Verde, Hawkers,
  Floribbean…), bars/breweries (Green Bench, Cycle, Emerald Bar, 3 Daughters,
  Kahuna's…). Local mini-chains are welcome; only national chains are excluded.

> **National-chain detection is list-driven but human-confirmed**
> (`data/national-chains.json`). The list is a **flagging aid, not an
> auto-remover**: `npm run check-chains [city]` (and a CI guard test in
> `apply-difficulty.test.mjs`) surface any in-play venue whose name matches a
> chain token (apostrophe-safe, word-boundary normalized — `matchNationalChain`
> in `apply-difficulty-lib.mjs`). You then **verify each** — most are obvious —
> and either mark the real chains `isNationalChain: true` in
> `data/fame-<city>.json` (which `apply-difficulty` drops) or add a local
> namesake's id to the list's `keepIds`. To start flagging a newly-spotted chain,
> add ONE token — no web search, no per-venue research. **FL-regional brands are
> deliberately off the list** (they stay). Namesakes like Seattle's "Chili's
> South Indian Cuisine" or Chicago's "The Village Inn Bar" live in `keepIds`.

Because St. Pete is enriched with `difficulty`, the daily game uses the
**difficulty plan** (easy → easy → medium → medium → hard, `DIFFICULTY_PLAN` in
`src/lib/daily.ts`), still layering category variety within each slot. Cities not
yet enriched use the legacy **cafe → restaurant → bar → landmark → wildcard**
plan. A vitest guard (`src/lib/locations.test.ts`) fails the build if a location
is out of bounds, an id collides, a difficulty is invalid, or the set can no
longer fill its plan.

## 4b. Difficulty — the fame + status pass

Each location gets a `difficulty` (`easy`/`medium`/`hard`) = the **inverse of its
local fame**. It's produced by a one-time **agentic web-research pass** (a
background workflow that fans out ~25 locations per agent):

1. **Status check** — every location is verified as `open` / `closed` / `renamed`
   / `uncertain` via current Yelp/Google/news. **Permanently-closed are removed**
   (not labeled hard); still-operating renames are updated to the new name;
   obvious junk (generic names, zero web presence) is dropped; duplicates merged.
2. **Fame score 0–100** — from TripAdvisor "things to do"/"best of" presence,
   Google/Yelp review **count relative to the city**, and Wikipedia. The rubric is
   calibrated against a human local's blind ratings: **down-weight tourist/critic
   fame** (Michelin / James Beard / TripAdvisor rank / lore-only Wikipedia) and
   **up-weight raw local ubiquity** — most restaurants/bars land 20–60; 80+ is
   almost exclusively non-food landmarks.
3. **Bucket into easy/medium/hard.** This is the percentile path — **narrow-easy:
   top 20% easy / next 45% medium / bottom 35% hard** — used only for an *uncapped*
   enriched city. **Every enriched city today sets a `playCap`**, so the live
   bucketing is instead **count-based — 40% easy / 40% medium / 20% hard** over the
   in-play set; see §4c. Either split is city-relative so the 2-easy/2-medium/1-hard
   plan always fills, even when a city has few true icons.

> **Maintenance rule — fame stays accurate on every edit.** Whenever a venue is
> added, re-pinned, or renamed to a successor business (see the `add-location`
> skill), give it a **freshly calibrated `fameScore`** — pull its **Google Places
> `userRatingCount`** (`GOOGLE_MAPS_KEY` in `.env.local`) and calibrate against the
> cache's fame↔reviewCount anchors. A **rename-to-successor is a different
> business**, so score the new one rather than inheriting the old venue's number.
> Because the live buckets are count-based, a corrected score reshuffles which
> venues sit in easy/medium/hard near the cuts — always re-run
> `apply-difficulty.mjs` after. (Status verification likewise prefers Google Places
> `business_status` over stale OSM.)

> **Crash-safe harvesting (large cities).** Generate the fame `Workflow` with
> **`scripts/gen-fame-workflow.mjs "<City, ST>" <tuples.json> <out.workflow.js>`** —
> it embeds the tuples as a literal so you launch via `scriptPath` (an `args`
> payload of thousands of tuples is too large to emit by hand) and edit the
> per-city calibration anchors in one place. The Workflow persists each batch
> agent's result to `agent-*.jsonl` in its transcript dir as it finishes, so a
> session/limit death only costs in-flight batches. **`scripts/harvest-fame-transcripts.mjs
> <workflowsDir> <out.json> [tuples.json]`** rebuilds `{results}` from those
> transcripts (recursive across runs + merge-mode, so it accumulates), and reports
> which ids are still MISSING (writing their tuples for a follow-up workflow over
> just the remainder — no re-research). Loop generate → launch → harvest → advance
> until MISSING = 0.
>
> ⚠️ **Scope the harvest to one city's run-dirs.** Location slugs collide across
> cities (e.g. `3rd-coast-cafe`), so harvesting the whole project transcript tree
> would apply another city's fame to a colliding id. Discover only this city's
> `wf_*` dirs by the rubric string — `grep -rl "places in <City, ST>" <projDir> |
> grep /subagents/workflows/ | sed -E 's#(/wf_[^/]+)/.*#\1#' | sort -u` — and
> harvest each into the accumulator. Source-scoping is the only safe fix;
> post-filtering by id can't undo a collision.
>
> Seattle's uncapped pass (2782 locations, 112 batches) needed three runs across
> two session-limit resets; **Chicago's (5325 → 4150, 267 batches) crossed ~5
> resets** — each time, harvest banked the finished batches and a regenerated
> follow-up workflow covered only the MISSING remainder. Tuples are reproducible
> from `public/locations.<id>.json`, so nothing transient is load-bearing.

The raw scores are cached in `data/fame-<city>.json` (committed, for provenance).
The pass is applied by the generalized, re-runnable **`scripts/apply-difficulty.mjs
<city> [fame-output.json]`** (it removes closed + `uncertain` junk + national
chains + renamed-to-closed, applies renames, de-dupes by id **and** by
same-name-within-~150 m — keeping higher fame — then buckets). The proximity gate
means genuine multi-location businesses (same name, far apart) are kept, while a
true same-spot alternate-slug dupe (e.g. Seattle's `moore-coffee-seattle` →
`moore-coffee`) is collapsed. It generalizes an earlier St. Pete-only one-off pass
(since removed).
Buckets are **city-relative**, so re-run the pass — and re-bucket — when a city's
dataset changes, and score any newly-added locations. The fame research itself is
a background `Workflow` (see `scripts/fame-workflow.template.md` and the
`add-or-update-city` skill). See PLAN.md §5.1b / §5.3b.

> **Parks/green spaces** are pulled inclusively by `fetch-pois` (any named
> `leisure=park|nature_reserve|garden|dog_park|recreation_ground`, no wiki tag
> required) — a city's public parks are exactly what locals know. The fame pass
> then trims the genuinely-obscure tail (intramural fields, pocket pollinator
> gardens). Lakes have no dedicated category and ride along as `park`.

## 4c. Play cap — `City.playCap` (`inPlay` / `fameScore` on each row)

A city's enriched dataset can be far larger than we want in daily rotation, and
because food/drink dominates by fame rank, an uncapped city plays almost all
restaurants/cafés/bars. A city may therefore set a **`playCap`** in `cities.json`:
`apply-difficulty.mjs` ranks the kept rows by fame — ties broken by **review
count** then id (`byFameRank`), since the coarse 0–100 fame leaves many rows level
at the cut — marks the **top `playCap`**
`inPlay: true`, and rebuckets *those* by **count — 40% easy / 40% medium / 20%
hard** (so 500 → 200/200/100, 200 → 80/80/40). Every kept row gets its
**`fameScore`** written onto it; the in-play rows get a `difficulty`; the
benched rows (`inPlay: false`) keep their fame but carry **no `difficulty`** (no
stale bucket). This keeps the whole scored set in the file — re-capping to a
different size is a pure re-run of `apply-difficulty.mjs` off the committed
`data/fame-<city>.json`, no re-research. Daily selection (`src/lib/daily.ts`)
filters to `inPlay !== false`. Current caps: St. Pete 400 (373 rows, all in
play), Ann Arbor 300, State College 200, Seattle 500, Chicago 700 (of 4149).

> **Removing a row reshuffles the cap.** Because in-play membership and the
> 40/40/20 buckets are recomputed from fame rank on every `apply-difficulty` run,
> dropping an in-play venue (e.g. a permanently-closed one) **promotes the next
> benched row** into the play set and can **nudge a few venues across a bucket
> boundary** (e.g. medium↔hard). That's expected, not churn — a freshness sweep
> that removes N venues will show N promotions plus a handful of difficulty
> flips. Any promoted *business* gets re-verified + stamped (below); promoted
> parks/landmarks are stamped as stable.

> **Freshness (`lastVerified`).** A periodic Google Places pass stamps each
> in-play venue with the `YYYY-MM-DD` it was last confirmed current: businesses
> whose `business_status` is OPERATIONAL, and parks/landmarks (no
> `business_status`) as stable still-present landmarks. The **only** in-play rows
> left unstamped are businesses with an uncertain status (chiefly
> `CLOSED_TEMPORARILY`) — an absent stamp is a deliberate "needs a look" signal.
> The field lives in the public dataset only (not the fame cache) and survives
> re-runs via `FIELD_ORDER`. Permanently-closed venues found in the pass are
> removed the usual way (`status: closed` in the fame cache → dropped).

> **Not just food.** Because fame rank skews to food, daily selection enforces a
> **non-food floor** (`MIN_NON_FOOD_PER_DAY = 1`) so a park/landmark/museum shows
> up every day — see PLAN.md §5. Parks survive the cap well (their famous ones
> rank high): St. Pete keeps all 24, Ann Arbor 67, State College 29, Seattle 33,
> Chicago 44.

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
city's `target` — or, when `target` is **`null`**, keeps **everything** in-bounds
(uncapped; let the fame pass trim the tail). Cities are defined once in the root
`cities.json` (read by both this script and the app via `src/lib/cities.ts`).
Current cities (rows in dataset → **in daily play** after the play cap, see
§4c): St. Pete (373 → **373**), State College (229 → **200**), Ann Arbor (340 →
**300**), Seattle (2388 → **500**), Chicago (4149 → **700**) — all enriched.

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
- **Rebranded spots** — `RENAMED_IN_OSM` drops names that OSM still has under an
  old brand (e.g. "La Carreta Bakery" → "Mi Carreta Restaurant and Bakery"); the
  corrected name is carried as a must-include in `data/<city>-manual.json` so a
  rebuild shows the current name once, not a stale duplicate.
- Spots not yet in OpenStreetMap have no trusted coordinates and are left out
  until added to OSM (or supplied manually, like Kahuna's & 3 Daughters here).

To grow further: re-run `npm run fetch-pois`, add more from
`data/candidates.json`. The script sets a descriptive `User-Agent` and falls back
across Overpass mirrors (the public servers 406 without a UA and often return a
busy error under load).

---

## 4d. Polygons — `npm run add-polygons` (large-footprint footprints)

Parks, golf courses, lakes, and other large areas are stored in OSM as a single
**centroid point** by `fetch-pois` (`out center`). Scoring a sprawling park by
its centroid is unfair: a player who correctly pins the *edge* of a big park can
be hundreds of metres from the centre. `scripts/add-polygons.mjs` backfills the
real **footprint** so a guess anywhere inside the shape scores a perfect 100, and
guesses outside fall off from the nearest edge (see PLAN.md §scoring).

```bash
npm run add-polygons                 # all cities
node scripts/add-polygons.mjs --city chicago         # one city
node scripts/add-polygons.mjs --city chicago --all   # ALSO benched park/golf rows
node scripts/add-polygons.mjs --city stpete --dry-run   # show, don't write
node scripts/add-polygons.mjs --force                # re-fetch existing polygons
```

By default only **in-play** park/golf rows are backfilled (the only ones the
daily game scores). Pass **`--all`** to also map benched (`inPlay:false`) rows —
useful so every footprint is mapped, and what all five cities were run with.

What it does, per eligible `park`/`golf_course` row without a `polygon`:

1. Queries Overpass for **ways + relations matching the row's `name`** within the
   city bbox, recursing into members (`(._;>;);`) and emitting **`out geom;`** —
   _not_ `out geom tags;`. This matters: on the public mirrors (overpass-api.de,
   kumi.systems) `out geom tags;` strips relation `members` to an empty list, so
   multipolygons come back with no geometry; plain `out geom;` returns both tags
   and inline member geometry. The recursion also surfaces member ways as
   standalone elements, so a relation's ring can be reassembled by member ref
   when inline geometry is absent. The query is name-only on purpose — large
   footprints are tagged inconsistently (`leisure=park`, `natural=water` for
   lakes, `landuse=*` for country clubs), so a tag filter would silently drop
   lakes and clubs.
2. **Picks the best match** by centroid proximity: candidates whose computed
   centroid is within `CENTROID_MATCH_RADIUS_M` (500 m) of the stored point; the
   nearest wins. This guards against a same-named feature elsewhere in the city.
3. **Extracts the outer ring.** Only **closed** ways are accepted (a linear way —
   a street sharing the name — is rejected). For multipolygon **relations** (how
   most large parks/lakes are stored), the `outer` member arcs are **stitched
   head-to-tail** into a closed ring (reversing arcs as needed); the largest
   resulting ring is the footprint. Holes and secondary outer rings are ignored
   (a guessing-game footprint doesn't need them). Arc chains that don't close are
   logged and skipped.
4. **Simplifies** with Douglas–Peucker (ε = 0.00005° ≈ 5 m). If the result is
   still over the **100-node** bundle-size cap, the epsilon is escalated (×1.7
   per pass, up to 20 passes) until it fits — so a huge park (e.g. Fort De Soto)
   is *coarsened* rather than dropped, and a `NOTE:` line records the
   before→after node counts. Coords are rounded to 5 dp and the open ring is
   written back onto the row in-place.

**Flagging the misses.** Every eligible large-footprint row that does **not**
receive a polygon (no OSM match, unusable geometry, or over the node cap) is
written to **`data/polygon-backfill-report.json`** with its id, name, city,
lat/lng, and reason. The rule: *no large park should remain a single point.* Work
the report by web-searching the geometry. Two override maps in the script handle
the misses, in priority order:

1. **`NAME_OVERRIDES`** (`id → OSM name`) — when the OSM `name` tag differs from
   our display name (e.g. "Demens Landing" vs "Demens Landing Park"). Re-queries
   by the corrected name.
2. **`OSM_ELEMENT_OVERRIDES`** (`id → {type, id}`) — when name matching can't
   work at all: a malformed/ambiguous relation, or a footprint stored as an
   *unnamed* way. Pin the exact element id verified on openstreetmap.org and the
   script fetches it directly (`buildElementQuery`).

If OSM has no usable polygon at all, hand-add the ring to the row. Rows left
without a polygon fall back to centroid scoring with the legacy 300 m freebie
radius (`LARGE_FALLBACK_RADIUS_M`) so they don't regress.

**When NOT to add a polygon.** Polygons exist to give *large* footprints a fair
"inside = 100" target. Keep these as a **point** instead:

- **Buildings & indoor venues** (conservatories, fieldhouses, halls) — a
  building-footprint polygon adds nothing for scoring. e.g. Garfield Park /
  Oak Park Conservatory.
- **Features smaller than the point freebie radius** (≈100 m) — a polygon has no
  freebie outside its edge, so it would make the location *harder* to score than
  the point fallback. e.g. a single ball diamond, a cluster of volleyball courts,
  a small formal garden bed.
- **Entities with no meaningful single footprint** — a county-wide body (Forest
  Preserve District of Cook County), a room inside a conservatory (Palm House).

These intentional point-only rows are recorded in
**`data/point-only-by-design.json`** (per city, with a reason), which doubles as
the "city is polygon-complete" signal: its `complete` array lists finished
cities, and a guard test (`src/lib/locations.test.ts`) asserts every in-play
park/golf in a complete city either has a polygon or is ledgered. To mark a city
done: finish its backfill, ledger any genuine point-only rows, add the city id to
`complete`.

**Multi-block linear parks.** A long park split into blocks by cross-streets is
stored in OSM as a multipolygon with many disjoint `outer` rings (e.g. Midway
Plaisance = 19 blocks over ~1.6 km). The single-largest-ring rule (step 3) would
grab only one block, so represent the whole corridor with a **convex hull** over
all member geometry instead.

The script is idempotent and **crash-safe / resumable**: without `--force` it
skips rows that already have a `polygon`, and it **checkpoints to disk every 20
matches** — so a killed or interrupted run keeps its progress and re-running the
same command simply picks up the remaining rows. It's polite to the public
Overpass mirrors (a 2 s delay between queries) and resilient under load: a
**per-request abort timeout** keeps a hung mirror from stalling the whole run,
and each mirror is **retried with backoff** (flagship first) before falling
through to the next — so the flagship's 406/429 rate-limiting is ridden out
rather than wasting time on overloaded mirrors.

> **Big cities & rate limits.** Per-location querying of a very large city (e.g.
> Chicago = 789 park/golf rows) can hit Overpass per-IP rate limits for hours. A
> far faster, rate-limit-proof alternative is a **single bulk query** for all
> named leisure/golf geometry in the city bbox (from any mirror), matched locally
> with the same helpers (`filterByName → pickBestMatch → extractOuterRing →
> simplifyToCap → finalizeRing`). Chicago was completed this way. Folding a bulk
> mode into the script is a tracked follow-up.

**Current status: all five cities are polygon-complete** (`complete` in
`data/point-only-by-design.json`): St. Pete, State College, Ann Arbor, Seattle,
Chicago. Every in-play `park`/`golf_course` has a polygon or is ledgered as
point-only by design. Highlights:
- **St. Pete**: five name-mismatch misses resolved via `NAME_OVERRIDES` (Mangrove
  Bay, Twin Brooks, Pasadena Yacht & Country Club, St. Pete Pier, Demens
  Landing); North Shore kickball fields + volleyball courts stay point-only.
- **Seattle**: Washington Park Arboretum pinned via `OSM_ELEMENT_OVERRIDES`
  (relation 241864 — its centroid is >500 m from the stored point).
- **Chicago**: completed via a bulk fetch; the conservatories + the Forest
  Preserve District + Palm House are ledgered point-only; Midway Plaisance uses a
  convex hull over its 19 blocks; Burnham Park pinned past the 500 m guard.

**Manually-corrected polygons (owner playtest feedback).** Five St. Pete
footprints the auto-extractor got wrong — the single-largest-ring rule (step 3)
drops secondary outer rings, and a couple of footprints aren't a clean single
OSM polygon. These were rebuilt by hand from their OSM geometry and written
straight onto the rows, so a plain re-run leaves them alone (idempotent skip);
**`--force` would regress them to the wrong auto-extracted shape — don't.**
- **Azalea Park** — multipolygon relation with **two `outer` rings**; the
  extractor kept only the larger and dropped the south/centre block. Fixed with
  the **convex hull of both outer rings** so the whole footprint is covered.
- **Clam Bayou Nature Preserve** — the named `nature_reserve` way is only the
  south chunk; the preserve's wetland actually continues ~680 m north toward
  Gulfport as a chain of unnamed `natural=wetland` parcels (the largest reaching
  N≈27.7464). Fixed with the **convex hull of the preserve + the contiguous
  wetland parcels** so it covers the full natural area, not just the south end.
- **Fort De Soto** — the precise multi-pronged coastline was visually noisy; per
  owner request it's now a **coarse convex hull** of the main-island coastline
  (≈12 nodes) that "encapsulates a lot of it" rather than tracing every inlet.
- **Isla Del Sol** — its named relation is malformed (8 `inner` members, no
  outer), so the footprint is the **convex hull of the entire golf course**
  (all 8 member rings + both `golf_course` ways), spanning the whole island —
  the earlier single-parcel pin was much too small.
- **Sawgrass Lake Park** — no *named* park boundary exists near the point, but an
  **unnamed `leisure=park` way (215108300)** found via Overpass `is_in` *does*
  enclose it (~1.2 × 2.1 km); that boundary is now the footprint, replacing the
  small "Sawgrass Lake" water body used before.

**Verifying the result:** load the game with **`?polygons`** (see
README / docs/PLAN.md) — it plays one round per polygon location in the city so
each shaded boundary can be eyeballed against the satellite map. Append a
comma-separated id list to re-check just a few: **`?polygons=azalea-park,isla-del-sol`**.
State College is fully backfilled (33/33).

---

## 5. Future: photos
When adding photo rounds, fill `photoUrl` from a **freely-licensed** source:
- **Wikimedia Commons** (best for landmarks; CC-BY-SA / public domain) — no key.
- **Mapillary** (street-level; CC-BY-SA) — free key, patchy coverage.
- Google Street View only if you accept a billing account + its ToS.
Record the image's own attribution alongside it. No schema change needed —
`photoUrl` already exists on `Location`.
