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
- **Content injection** — defangs `@mentions`, code fences, and Markdown
  link/image syntax (inline + reference): no pinging users, no breaking out of
  the issue body, and no _disguised_ (text-hides-destination) link or
  auto-loading image beacon. A **bare** `https://…` URL is still auto-linkified
  by GitHub and left visible on purpose (so triagers can read it); a private
  triage repo (below) is the defense-in-depth for that residual.
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

---

# Leaderboard worker (`leaderboard.mjs`)

A **second** Cloudflare Worker — separate from the bug worker but in this same
directory because it imports the bug worker's `cors`/origin helpers. It backs the
**anonymous daily leaderboard**: store one score per `(city, date, device)` in
[Cloudflare **D1**](https://developers.cloudflare.com/d1/) (serverless SQLite)
and answer "you placed **Xth of Y** today".

- **Anonymous.** Identity is a random UUID in the browser's `localStorage`
  (`kyc:clientId`) — no accounts, no names, no PII. The `scores.user_id` column
  is reserved (NULL) so a login can be linked later. (That future migration is
  inherently lossy: a player who cleared localStorage has no id to link.)
- **Official games only.** The client submits **only** the real daily challenge.
  Shuffle (`?shuffle`) and date overrides (`?date=`) never submit, and the worker
  independently rejects unknown cities and any date outside a ±1-day window of
  the city-local "today" (it recomputes the date itself — see `CITY_TZ`).
- **Fails closed** the same way: the per-IP rate limit in
  `wrangler.leaderboard.toml` is on by default, so a fresh deploy isn't
  wide-open. **Anti-cheat is a documented non-goal** (`docs/PLAN.md` §6): scores
  are client-computed, so a determined actor can still POST a fake total / inflate
  `Y`. The rate limit bounds it; turn on Turnstile (below) if abuse appears.
- Behind `VITE_LEADERBOARD_ENDPOINT` — unset means the app just omits the
  standing line, so this is **optional**.
- **Bounded storage.** A Cron Trigger (`[triggers] crons` in the toml → the
  worker's `scheduled` handler) prunes `scores` older than 90 days every night,
  so the table never grows without limit. `wrangler deploy` registers the cron
  automatically — nothing extra to set up. (Local: `wrangler dev --test-scheduled`
  then `curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"` to fire it.)

- **Per-player streak.** Each submit also advances a consecutive-day streak for
  `(city, client_id)` in a separate `streaks` table (migration `0002`) and
  returns it — anonymous and accounts-ready like the scores, and kept in its own
  table so it **survives** the retention prune. The UI shows the server streak
  when present, else the local one.

Request/response shape:
- **Submit:** `POST { city, date, score, clientId, turnstileToken? }` → `{ ok, rank, total, streak? }` (`streak` = `{ current, best }`).
- **View:** `GET ?city=&date=` → `{ ok, total, scores[] }` — the day's top 100
  scores (desc), anonymous (scores only, no ids/names). Powers the "🏆 View
  leaderboard" button; rate-limited and city/date-validated like the POST.

## Try it locally first (no production resources)

You can exercise the whole flow against a **local** D1 file before deploying:

```bash
# 1. Create the local D1 + apply the schema (writes to ./.wrangler, gitignored):
wrangler d1 migrations apply kyc-leaderboard --local -c worker/wrangler.leaderboard.toml

# 2. Run the worker locally (defaults to http://localhost:8787):
wrangler dev -c worker/wrangler.leaderboard.toml

# 3. In another terminal, point the app at it and run the dev server:
echo 'VITE_LEADERBOARD_ENDPOINT=http://localhost:8787' >> .env.local
npm run dev
```

`ALLOWED_ORIGIN` already includes `http://localhost:5173`, so the dev site is
allowed. Finish a day (the **official** one — not `?shuffle`/`?date=`) and you'll
see "🏆 You placed 1st of 1 today". Open a second browser/profile (it gets a new
`clientId`) and finish again to watch `Y` grow. Inspect the rows directly:

```bash
wrangler d1 execute kyc-leaderboard --local \
  -c worker/wrangler.leaderboard.toml --command "SELECT * FROM scores"
```

## Deploy (one time, free tier)

```bash
# 1. Create the database, then paste the printed database_id into
#    worker/wrangler.leaderboard.toml ([[d1_databases]] database_id):
wrangler d1 create kyc-leaderboard

# 2. Apply the schema to the REMOTE database:
wrangler d1 migrations apply kyc-leaderboard --remote -c worker/wrangler.leaderboard.toml

# 3. Deploy the worker (rate limit + ALLOWED_ORIGIN are already in the toml):
wrangler deploy -c worker/wrangler.leaderboard.toml
```

Then set the app env (repo **Variable** for CI, or `.env.local` locally) to the
printed URL and rebuild/redeploy the site:

```
VITE_LEADERBOARD_ENDPOINT=https://kyc-leaderboard.<you>.workers.dev
```

## Optional: require Turnstile (stronger anti-inflation)

To require a bot check on every submission, `wrangler secret put TURNSTILE_SECRET
-c worker/wrangler.leaderboard.toml`. **Note:** v1 submits automatically at
end-of-day with no widget, so enabling this also needs an **invisible Turnstile
execute** on the client before `submitDailyScore` (not built yet). Until that's
wired, leave `TURNSTILE_SECRET` unset and rely on the rate limit.
