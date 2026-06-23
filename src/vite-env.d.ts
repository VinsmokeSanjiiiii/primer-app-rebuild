/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase project overrides (optional).  When unset, the app uses
  // the embedded `primer3` project config.
  readonly VITE_FB_API_KEY?: string;
  readonly VITE_FB_AUTH_DOMAIN?: string;
  readonly VITE_FB_DATABASE_URL?: string;
  readonly VITE_FB_PROJECT_ID?: string;
  readonly VITE_FB_STORAGE_BUCKET?: string;
  readonly VITE_FB_MESSAGING_SENDER_ID?: string;
  readonly VITE_FB_APP_ID?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

// Optional native Capacitor Live Updates plugin. Loaded dynamically at runtime;
// declared here so TypeScript doesn't require the package to be installed in
// the web build.
declare module "@capacitor/live-updates" {
  export interface SyncResult {
    activeApplicationPathChanged?: boolean;
    [k: string]: unknown;
  }
  export function sync(opts?: unknown): Promise<SyncResult>;
  export function reload(): Promise<void>;
  export function addListener(
    event: string,
    handler: (data: { percent?: number; bytes?: number; total?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => void };
}

