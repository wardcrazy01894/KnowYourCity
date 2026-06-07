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

## Notes
- Token is a Worker **secret**, never committed. `GH_REPO` / `ALLOWED_ORIGIN` are
  plain vars in `wrangler.toml`.
- The worker caps message (2k) and log (6k) length and labels issues
  `bug`, `from-app`.
- Any host works (Cloudflare/Deno Deploy/Netlify/Vercel functions) — this is just
  the simplest free option. Keep the same request/response shape:
  `POST { message, context, logs }` → `{ ok, url }`.
