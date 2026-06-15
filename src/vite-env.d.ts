/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Mapbox token for sharper satellite tiles; see .env.example. */
  readonly VITE_MAPBOX_TOKEN?: string
  /** Optional app version string surfaced in logs. */
  readonly VITE_APP_VERSION?: string
  /** Optional bug-report endpoint (the worker/ function). Falls back to a
   *  prefilled GitHub issue page when unset. */
  readonly VITE_BUG_ENDPOINT?: string
  /** Optional leaderboard endpoint (the worker/leaderboard.mjs function). When
   *  unset, the daily standing line is simply omitted. */
  readonly VITE_LEADERBOARD_ENDPOINT?: string
  /** Optional Cloudflare Turnstile site key — shows a bot check on the bug form. */
  readonly VITE_TURNSTILE_SITEKEY?: string
  /** Optional Cloudflare Web Analytics beacon token (public) — page-view
   *  tracking when set; see .env.example. */
  readonly VITE_CF_BEACON_TOKEN?: string
  /** Git short hash injected at build time; compared against /version.json to
   *  detect a new deploy in open tabs. */
  readonly VITE_BUILD_HASH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
