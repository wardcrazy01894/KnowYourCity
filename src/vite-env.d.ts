/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Mapbox token for sharper satellite tiles; see .env.example. */
  readonly VITE_MAPBOX_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
