# Decisions (answered by Alex, 2026-06-06)

These were the open questions; this records the answers and how they were
applied. Open follow-ups live in `BACKLOG.md`.

## Resolved

1. **Map tiles** — Esri-only (free, no key) for now; add a Mapbox token later if
   imagery feels soft. *Applied: no change; Mapbox path stays optional via
   `VITE_MAPBOX_TOKEN`.*

2. **Bounding box** — keep the current St. Pete box for now; it's easy to change
   later. *Applied: unchanged. (See the multi-city plan — bbox becomes per-city
   data.)*

3 & 4. **Must-include / banned places** — none yet; Alex will provide lists
   later. Each city should aim for **~200 places** (lots of restaurants/bars are
   currently filtered out and should be added). *Applied: launch target updated
   to ~200 in PLAN/BACKLOG; the curation step takes force-include/ban lists.*

5. **Starting zoom** — start showing the **whole city**, let the player zoom in
   to place the pin (maptap-style). *Applied: already the behavior — map fits the
   full bounds on each round, min/max zoom allow zooming in to building level.*

6. **Scoring** — **0–100 per round**, **linear**: 100 within **300 m**, down to
   0 at **5 km**. *Applied: `scoring.ts` (`MAX_ROUND_SCORE=100`,
   `PERFECT_RADIUS_M=300`, `ZERO_DISTANCE_M=5000`, linear). Share emoji tiers
   rescaled (🟩≥80 🟨≥50 🟧≥20 ⬛<20). Perfect day = 500.*

7. **Clues** — **no clues by default** for now. *Applied: `SHOW_CLUES=false` in
   `Game.tsx`; clues remain in the data for later.*

8. **Daily rollover** — switch at **midnight US Eastern**. *Applied: `getDateKey`
   uses `America/New_York` via `Intl` (DST-aware); each city now carries its own
   IANA timezone.*

9. **Dataset size** — **~200 before launch** (more is better); anything is fine
   while prototyping. *Applied: target documented; current shipped set is 379 (plus 4 more cities).*

10. **Hosting** — free `github.io` for now (it is free for public repos); a
    **custom domain later** (name TBD). *Applied: repo made public; custom
    domain **knowyourcity.gg** bought at Porkbun and live as of 2026-06-10.*

11. **Photos in v1** — keep **v1 text-only**; photos are a backlog item.
    *Applied: backlog updated; `photoUrl` field already in the schema.*

## Still needed from Alex (later)
- Per-city **must-include** and **banned** lists.
- Whether to widen the St. Pete bbox to recapture the Old Sunshine Skyway pier
  and north-county golf (both fell just outside the current box).
- ~~The eventual custom domain name.~~ *Resolved: **knowyourcity.gg** (see #10).*
