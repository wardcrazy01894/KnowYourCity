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
  **Enforce HTTPS**); GitHub provisions the certificate. Changing
  registrar/DNS means re-pointing the ALIAS — nothing in the repo.
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
Secrets and variables → Actions → **Variables** tab — *not* Secrets):

| Variable | Current value | Purpose |
|----------|---------------|---------|
| `VITE_BUG_ENDPOINT` | `https://kyl-bug.wardcrazy01894.workers.dev` | bug-report worker (one-click GitHub issues) |
| `VITE_TURNSTILE_SITEKEY` | `0x4AAAAAADgHt68jxl4onK-C` | public Turnstile site key for the bug form's bot check |
| `VITE_MAPBOX_TOKEN` | *(unset, on purpose)* | optional Mapbox satellite tiles; unset → free keyless **Esri** tiles |

If `VITE_BUG_ENDPOINT` is unset, the bug form falls back to opening a prefilled
GitHub "new issue" page (no worker needed). For local builds these live in
`.env.local` (gitignored) instead.

## Bug-report worker

A Cloudflare Worker (see [`../worker/`](../worker/)) holds the GitHub token
**server-side** and files issues on the app's behalf. It's hardened (defang
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

## Before opening a PR

`main` is protected; CI must pass. Run the full gate locally (the same checks CI
runs — note `format:check`, which `build`/`lint` do **not** cover):

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```
