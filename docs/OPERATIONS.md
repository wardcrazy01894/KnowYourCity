# Operations runbook

How the **live** site is hosted, deployed, and operated. (Architecture is in
[`PLAN.md`](PLAN.md); data pipeline in [`DATA-SOURCING.md`](DATA-SOURCING.md).)

## Live site

- **URL:** <https://knowyourcity.gg/>
- **Host:** GitHub Pages, Source = **GitHub Actions** (`build_type: workflow`).
  Pages was auto-enabled by the deploy workflow — no manual Settings toggle.
- **Custom domain:** `knowyourcity.gg`, registered at **Porkbun** (auto-renew
  ON). DNS at Porkbun: **ALIAS** on the apex → `wardcrazy01894.github.io`,
  **CNAME** `www` → same. The domain is set in repo Settings → Pages (with
  **Enforce HTTPS**); GitHub provisions the certificate. `public/CNAME` also
  ships the domain in every build artifact — workflow-sourced Pages keeps the
  domain in Settings (the file is belt-and-braces, and required if deploys
  ever switch back to a branch source).
- **Repo rename note (2026-06-10):** the repo was renamed
  `KnowYourLocals` → `KnowYourCity` at cutover. GitHub redirects the old web
  and git URLs, and the worker's fine-grained PAT follows the repo ID, so
  issue-filing survives the rename.
- **Known cutover consequence:** localStorage (streaks/history, `kyl:*`-era keys)
  does **not** carry across origins, so players who used
  `wardcrazy01894.github.io` start fresh at `knowyourcity.gg`. Accepted
  one-time cost; not a bug.
- Went live **2026-06-07** (github.io); custom domain cutover **2026-06-10**.

## Deploy

- **Automatic:** every push to `main` runs `.github/workflows/deploy.yml`
  (`npm run build` → upload Pages artifact → deploy). Takes a couple of minutes;
  the live URL updates when the `deploy` run goes green.
- **Manual re-run:** Actions tab → **deploy** → **Run workflow** (it also has
  `workflow_dispatch`). Useful after changing a repo Variable (below) — Variables
  only take effect on the **next build**.
- **Rollback:** revert the offending commit/PR on `main` (auto-redeploys), or, to
  pull the site entirely, Settings → Pages → disable.
- `deploy.yml` is **not** a required status check, so a failed deploy never blocks
  merges; it just means the last publish didn't happen. Check the Actions tab.

## Client configuration — repo **Variables**

The site is a static client bundle, so all of its config is **public** (it ships
in the JS). It's injected at build time from repo **Variables** (Settings →
Secrets and variables → Actions → **Variables** tab — _not_ Secrets):

| Variable                    | Current value                                                       | Purpose                                                                                          |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `VITE_BUG_ENDPOINT`         | `https://kyl-bug.wardcrazy01894.workers.dev`                        | bug-report worker (one-click GitHub issues)                                                      |
| `VITE_TURNSTILE_SITEKEY`    | `0x4AAAAAADgHt68jxl4onK-C`                                          | public Turnstile site key for the bug form's bot check                                           |
| `VITE_MAPBOX_TOKEN`         | _(unset, on purpose)_                                               | optional Mapbox satellite tiles; unset → free keyless **Esri** tiles                             |
| `VITE_CF_BEACON_TOKEN`      | `38e507931236442a83feeb410f152878`                                  | Cloudflare Web Analytics beacon — cookieless page-view tracking                                  |
| `VITE_LEADERBOARD_ENDPOINT` | the `kyc-leaderboard` worker URL (`…workers.dev` or a custom route) | anonymous daily leaderboard + per-player streak worker; **unset → the leaderboard UI is hidden** |

If `VITE_BUG_ENDPOINT` is unset, the bug form falls back to opening a prefilled
GitHub "new issue" page (no worker needed). If `VITE_LEADERBOARD_ENDPOINT` is
unset, the leaderboard view and server streak are simply not shown (the game
plays fully without them). For local builds these live in `.env.local`
(gitignored) instead.

## Analytics

**Cloudflare Web Analytics** (free, cookieless — no consent banner needed).
The dashboard is at Cloudflare → **Web Analytics**; it shows page views,
visits, referrers, countries, and Core Web Vitals. The beacon script only
loads when `VITE_CF_BEACON_TOKEN` is set (a **public** value), so local dev
and forks are untracked. Changing/rotating the token = update the repo
Variable, then re-run the deploy workflow (Variables bake in at build time).
Note: the beacon _script_ is allowlisted in the CSP `script-src`, but its
data reporting rides on the currently-wide `connect-src *` — if `connect-src`
is ever tightened, add `https://cloudflareinsights.com` or analytics dies
silently.

## SEO

- **OG/Twitter meta tags** are hardcoded in `index.html` (title, description, `og:image`, `og:url`). No runtime generation needed.
- **`public/og-image.png`** — the social share image (1200×630). Regenerate manually and commit if branding changes.
- **`public/robots.txt`** — allows all crawlers; points to the sitemap.
- **`public/sitemap.xml`** — static, lists `https://knowyourcity.gg/`. Update manually if URL structure changes.
- **Search Console / Bing:** submit the sitemap URL (`https://knowyourcity.gg/sitemap.xml`) in Google Search Console and Bing Webmaster Tools. (Owner follow-up — not yet done.)
- These static files are guarded by `src/lib/seo-meta.test.ts`; CI will catch accidental deletions.

## Bug-report worker

A Cloudflare Worker (see [`../worker/`](../worker/)) holds the GitHub token
**server-side** and files issues on the app's behalf. (It keeps its legacy
`kyl-bug` name on purpose: renaming a Worker changes its `workers.dev` URL and
drops its secrets, for zero player-visible benefit.) It's hardened (defang
@mentions/code-fences, payload caps, off-site URL drop, per-IP rate limit,
Turnstile, server-side Origin allowlist). Worker secrets (`GH_TOKEN`,
`TURNSTILE_SECRET`) live in Wrangler, never in this repo.

- **Origin allowlist:** `ALLOWED_ORIGIN` in `worker/wrangler.toml` includes the
  site origin `https://knowyourcity.gg` (plus localhost for dev). Changing it
  requires a worker redeploy (`wrangler deploy` in `worker/`).
- **Turnstile hostname:** the Turnstile **sitekey must list the site hostname**
  (`knowyourcity.gg`) in the Cloudflare Turnstile dashboard, or the bot
  check fails on the live site and the fail-closed worker rejects reports.
  ✅ Verified working end-to-end on 2026-06-07 (a real report from the live site
  filed a GitHub issue, pre-cutover via `wardcrazy01894.github.io`).

## Leaderboard worker (`kyc-leaderboard`)

A **separate** Cloudflare Worker (`worker/leaderboard.mjs`, config
`worker/wrangler.leaderboard.toml`) backs the anonymous daily leaderboard (#92)
and the server-side per-player streak (#95). It is backed by a **Cloudflare D1**
database (`kyc-leaderboard`) and shares the bug worker's CORS/origin helpers, so
keep both worker files together. Submissions are anonymous (a browser-generated
`client_id`, no PII), size-capped, origin-allowlisted, per-IP rate-limited
(30/60s), and fail-closed; scores are pruned after **90 days** by a daily cron.

> ⚠️ **Unlike the web app, the workers do NOT auto-deploy.** `deploy.yml` only
> ships the static site. Worker code **and D1 migrations** are applied **by hand**
> with Wrangler — a migration merged to `main` is **not** live until you run the
> commands below. There is no CI signal if you forget.

**Deploy the worker** (from the repo root):

```bash
wrangler deploy -c worker/wrangler.leaderboard.toml
```

**Apply D1 migrations** (`worker/migrations/*.sql`, run in order; idempotent
`CREATE … IF NOT EXISTS`):

```bash
wrangler d1 migrations apply kyc-leaderboard --local    # local dev
wrangler d1 migrations apply kyc-leaderboard --remote   # production
```

The first deploy also needs the D1 database created once
(`wrangler d1 create kyc-leaderboard`, then paste the printed `database_id` into
`wrangler.leaderboard.toml`). `TURNSTILE_SECRET` is optional here (see the toml
header) — leave it unset unless you also wire an invisible Turnstile execute on
the client. The bug worker (`kyl-bug`) deploys the same way with
`wrangler deploy` from `worker/` (its config is the default `wrangler.toml`).

## New-deploy refresh (stale-tab busting)

Every build stamps a git build hash into the bundle (`VITE_BUILD_HASH`, defined
in `vite.config.ts`) and also emits a static **`/version.json`** carrying the
same hash. An open tab fetches `version.json` **on tab focus and every ~5 min**;
if the hash no longer matches the one it booted with, it picks up the new deploy
**automatically and silently** — no banner, no click. It only reloads when the
reload wouldn't change what the player is looking at: the **city picker**, or
**today's results screen** (a reload there just re-renders the same results — so a
feature like confetti reaches a finished player without a click). It **defers** in
every disruptive case: a game **actively mid-round** (never interrupt a guess),
and **any game for a day other than the real current date** — e.g. sitting on
yesterday's results after the day rolled over, where a reload would drop them into
the new day's game. Leaving the results screen for the next day is the player's
click; whenever they do start a fresh game it loads on the newest bundle anyway.
The decision is `shouldDeferReload(current, todayKey)` — with `todayKey` computed
fresh from the city timezone at check time, so a tab open past midnight is judged
correctly. Logic lives in `src/lib/version.ts` and `src/App.tsx` (#91; silent
auto-reload in #127). Both hashes come from the same build (no intra-deploy
disagreement), and a `reloadScheduled` guard plus the post-reload hash match rule
out a reload loop. (No service worker, so a reload is all it takes to load new
code.)

## Before opening a PR

`main` is protected; CI must pass. Run the full gate locally (the same checks CI
runs — note `format:check`, which `build`/`lint` do **not** cover):

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```
