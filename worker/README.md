# Bug-report worker

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that receives bug
reports from the app and files a **GitHub issue** — so the GitHub token stays
server-side instead of in the client bundle.

The app uses it when `VITE_BUG_ENDPOINT` points at the deployed worker URL. If
that var is unset, the app falls back to opening a prefilled GitHub "new issue"
page, so this is **optional** — set it up when you want one-click reporting.

## Deploy (one time, free tier)

1. Install Wrangler and log in:
   ```bash
   npm i -g wrangler
   wrangler login
   ```
2. Create a **fine-grained personal access token** on GitHub with
   **Issues: Read and write** scoped to the `KnowYourLocals` repo only.
3. From this `worker/` directory:
   ```bash
   wrangler secret put GH_TOKEN      # paste the token when prompted
   wrangler deploy
   ```
   Wrangler prints a URL like `https://kyl-bug.<you>.workers.dev`.
4. Set the app env and rebuild/redeploy the site:
   ```
   VITE_BUG_ENDPOINT=https://kyl-bug.<you>.workers.dev
   ```
5. (Recommended) In `wrangler.toml`, set `ALLOWED_ORIGIN` to your site's origin
   (e.g. `https://wardcrazy01894.github.io`) and `wrangler deploy` again.

## ⚠️ Before you make the site public — abuse hardening

This is a public, unauthenticated endpoint (its URL is in the shipped JS). Without
the steps below, anyone who finds it could spam GitHub issues. The worker already
**neutralizes content injection** (defangs `@mentions` and code fences so reports
can't ping people or break out of the issue body), **drops off-site URLs**,
enforces an **Origin allowlist**, and **caps payload size** — but you should also:

1. **Set `ALLOWED_ORIGIN`** to your real site origin (done in `wrangler.toml`).
2. **Turn on a bot check (recommended).** Create a free
   [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget:
   - `wrangler secret put TURNSTILE_SECRET` (the Turnstile *secret* key)
   - set `VITE_TURNSTILE_SITEKEY` in the app to the Turnstile *site* key
   The form then shows a check and the worker rejects unverified posts.
3. **Add a per-IP rate limit (recommended).** `wrangler kv namespace create RL`
   and uncomment the `[[kv_namespaces]]` block — caps reports to 5/IP/hour.
4. **Consider a private triage repo.** Point `GH_REPO` at a *private* repo so any
   spam/abusive content that slips through isn't world-visible. You can copy
   genuine reports to the public repo manually.

Until Turnstile **or** the KV rate limit is in place, prefer leaving
`VITE_BUG_ENDPOINT` unset — the app falls back to the prefilled GitHub issue page,
which requires a human GitHub login and so can't be scripted.

## Notes
- Token is a Worker **secret**, never committed. Use a **fine-grained PAT,
  Issues: read & write, this repo only** — not a classic `repo`-scoped token.
- The worker caps message (2k) / logs (6k) / body (20k) and labels issues
  `bug`, `from-app`.
- Any host works (Cloudflare/Deno Deploy/Netlify/Vercel functions) — this is just
  the simplest free option. Keep the request/response shape:
  `POST { message, context, logs, turnstileToken? }` → `{ ok, url }`.
