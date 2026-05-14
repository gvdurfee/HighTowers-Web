/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  /** Public origin of Node API when front end is not same-origin (e.g. GitHub Pages). */
  readonly VITE_API_BASE_URL?: string
  /** Optional dev-only key for `/api/content-packs` when server sets CONTENT_PACK_API_KEY. */
  readonly VITE_CONTENT_PACK_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
