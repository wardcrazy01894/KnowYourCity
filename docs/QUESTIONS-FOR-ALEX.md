# Questions for Alex

Nothing here blocks me from starting to build — these are decisions and inputs
that will make the game *better/correct*. Answer whenever; I've noted my default
if you don't.

## A. Map tiles — Esri (zero key) vs Mapbox (free key)
- **Default:** Esri World Imagery, no key, works immediately, satellite to ~zoom
  19 (building-level in downtown St. Pete).
- **Upgrade:** a free Mapbox token (no credit card) → sharper imagery, zoom to
  22. Token is visible in the shipped JS, so I'd restrict it to your domain.
- **Q1:** Want me to start Esri-only and you grab a Mapbox token later if the
  imagery feels soft? *(My default: yes, Esri-only first.)*

## B. The play area (bounding box)
- I'm using St. Pete box `S 27.62, W -82.78, N 27.86, E -82.58` for both the
  data pull and the map's pan limits.
- **Q2:** Is that the right footprint? Should it include **St. Pete Beach / the
  Don CeSar** (that's ~`27.70, -82.74`, just outside a tight city box — the
  current box already includes it) and Gulfport? Or stay tighter to the city
  proper? *(My default: keep the box above; it covers the Don CeSar.)*

## C. Must-include landmarks
- **Q3:** List any places you definitely want in the game even if the auto-pull
  misses them (I'll force-include). Starters already in the sample: Sunken
  Gardens, The Don CeSar, Vinoy Park, St. Pete Pier, The Dalí Museum.
- **Q4:** Anything you want **banned** (e.g. too obscure, private, or you just
  don't like it)?

## D. Difficulty / feel
- **Q5:** Should the map start **zoomed out** (whole city — harder) or
  **mid-zoom** (easier)? *(Default: start showing the whole play area.)*
- **Q6:** Scoring is first-draft: full 5000 within **75 m**, zero past **12 km**,
  smooth decay between (perfect day = 25,000). Want it more forgiving or more
  punishing? *(Default: ship these, tune after we both play a few.)*
- **Q7:** Show the optional **clue** under each name by default, or only on
  request / never? *(Default: show a short clue.)*

## E. Daily rollover timezone
- The "same 5 for everyone" trick keys off the **UTC** date, so a new puzzle
  appears ~7–8pm St. Pete time, not at local midnight.
- **Q8:** Fine to keep UTC (simplest, what Wordle-likes do)? Or should the day
  roll over at **St. Pete midnight** (I'd hardcode a -5h offset; slight DST
  quirk)? *(Default: UTC.)*

## F. How many places before launch
- **Q9:** Good with me curating **~60–100** notable St. Pete places (rarer
  repeats) before we call it "done enough" to share? Or launch sooner with
  fewer and grow it? *(Default: aim for ~60, but the app is playable as soon as
  there are 5+.)*

## G. Hosting / sharing later
- **Q10:** When ready, host free at
  `https://wardcrazy01894.github.io/KnowYourLocals/` (needs the repo public or
  Pages-on-private), or do you want a **custom domain** (e.g. a `.gg` to match
  maptap)? I can wire either. *(Default: github.io first, domain later.)*
- **Q11:** Repo is **private** right now. Flip to public when you want Pages the
  easy way? *(Default: leave private until you say go.)*

## H. Scope confirmations (just check my assumptions)
- v1 = **St. Pete only**, **text name → pin**, **no photos**, **no backend /
  leaderboard**. Photos and a future leaderboard are designed-for but not built.
- **Q12:** Any of that you'd reprioritize? (e.g. you'd rather have photos in
  v1 for a few marquee places like the Don CeSar.)
