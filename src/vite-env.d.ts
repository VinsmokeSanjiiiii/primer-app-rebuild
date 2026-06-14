/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase project overrides (optional). When unset, the app uses
  // the embedded `primerdb2` project config.
  readonly VITE_FB_API_KEY?: string;
  readonly VITE_FB_AUTH_DOMAIN?: string;
  readonly VITE_FB_DATABASE_URL?: string;
  readonly VITE_FB_PROJECT_ID?: string;
  readonly VITE_FB_STORAGE_BUCKET?: string;
  readonly VITE_FB_MESSAGING_SENDER_ID?: string;
  readonly VITE_FB_APP_ID?: string;
  // Development offline mode toggle (set to "true" to use seed data)
  readonly VITE_OFFLINE_MODE?: string;
  // Built-in Vite dev mode flag
  readonly DEV?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
