/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Mapbox token for sharper satellite tiles; see .env.example. */
  readonly VITE_MAPBOX_TOKEN?: string
  /** Optional app version string surfaced in logs. */
  readonly VITE_APP_VERSION?: string
  /** Optional bug-report endpoint (the worker/ function). Falls back to a
   *  prefilled GitHub issue page when unset. */
  readonly VITE_BUG_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
