/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Mapbox token for sharper satellite tiles; see .env.example. */
  readonly VITE_MAPBOX_TOKEN?: string
  /** Optional app version string surfaced in logs. */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
