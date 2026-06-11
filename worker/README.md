# Bug-report worker

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that receives bug
reports from the app and files a **GitHub issue** — so the GitHub token stays
server-side instead of in the client bundle.

The app uses it when `VITE_BUG_ENDPOINT` points at the deployed worker URL. If
that var is unset, the app falls back to opening a prefilled GitHub "new issue"
page, so this is **optional** — set it up when you want one-click reporting.

The worker **fails closed**: it won't create issues unless an anti-abuse control
is configured. A per-IP **rate limit is on by default** (the `[[ratelimits]]`
block in `wrangler.toml` — no account resource needed), so a fresh deploy is not
wide-open. Turnstile is recommended on top for a public repo.

## Deploy (one time, free tier)

1. Install Wrangler (**>= 4.36**, for the rate-limit binding) and log in:
   ```bash
   npm i -g wrangler@latest
   wrangler login
   ```
2. Create a **fine-grained personal access token** on GitHub with
   **Issues: Read and write** scoped to the `KnowYourCity` repo only.
3. From this `worker/` directory:
   ```bash
   wrangler secret put GH_TOKEN      # paste the token when prompted
   wrangler deploy
   ```
   Wrangler prints a URL like `https://kyl-bug.<you>.workers.dev`.
   (`ALLOWED_ORIGIN` and the rate limit are already set in `wrangler.toml`.)
4. Set the app env and rebuild/redeploy the site:
   ```
   VITE_BUG_ENDPOINT=https://kyl-bug.<you>.workers.dev
   ```
   That's the minimum to go live safely (rate-limited + injection-hardened).

## ⚠️ Before you make the site public — abuse hardening

This is a public, unauthenticated endpoint (its URL is in the shipped JS). The
worker is hardened against the main abuse vectors out of the box:

- **Fails closed** — refuses to run without a rate limit or Turnstile configured.
- **Rate limit ON by default** — 5 reports / IP / 60s (`[[ratelimits]]`).
- **Content injection** — defangs `@mentions` and code fences (no pinging users,
  no breaking out of the issue body).
- **Phishing** — drops off-site `url`s; **Origin allowlist**; **payload caps**.

Recommended hardening on top (especially since reports are filed to the **public**
repo):

1. **Turn on Turnstile (strongly recommended).** Create a free
   [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget:
   - `wrangler secret put TURNSTILE_SECRET` (the Turnstile *secret* key)
   - set `VITE_TURNSTILE_SITEKEY` in the app to the Turnstile *site* key
   - **add your live hostname to the widget's allowed Hostnames** in the
     Turnstile dashboard (e.g. `knowyourcity.gg`). If the hostname
     isn't listed, the check fails on the live site and the fail-closed worker
     rejects every report. (Verified working from the live Pages site 2026-06-07.)
   The form then shows a check and the worker rejects unverified posts. This is
   the real defense against scripted spam (the rate limit is per-IP, so a botnet
   can still trickle in without it).
2. **Or use a private triage repo.** Point `GH_REPO` at a *private* repo so any
   spam that slips through isn't world-visible; copy genuine reports over.

The rate limit alone makes a fresh deploy non-trivial to abuse, but for a public
issue tracker, add Turnstile before sharing widely.

## Notes
- Token is a Worker **secret**, never committed. Use a **fine-grained PAT,
  Issues: read & write, this repo only** — not a classic `repo`-scoped token.
- The worker caps message (2k) / logs (6k) / body (20k) and labels issues
  `bug`, `from-app`.
- Any host works (Cloudflare/Deno Deploy/Netlify/Vercel functions) — this is just
  the simplest free option. Keep the request/response shape:
  `POST { message, context, logs, turnstileToken? }` → `{ ok, url }`.
