/**
 * Update delivery via Capacitor Live Updates (OTA).
 *
 * The native `@capacitor/live-updates` plugin handles fetching,
 * verifying, and applying the JS bundle update. On web, Live Updates
 * is a no-op and `sync()` resolves with `activeApplicationPathChanged
 * = false`; we surface that as an "unsupported on this platform"
 * outcome so the UI can offer a fallback (open release notes / Play
 * Store URL in the system browser).
 *
 * We expose a tiny wrapper around `sync()` + `reload()` so the rest
 * of the app doesn't depend on the plugin's surface directly. This
 * keeps tests trivially mockable.
 */

import { log } from "./log";

const LIVE_UPDATES_MODULE_SPECIFIER = "@capacitor/live-updates";

export type ProgressEvent =
  | { kind: "start" }
  | { kind: "progress"; percent: number }
  | { kind: "applied" }
  | { kind: "unsupported"; reason: string }
  | { kind: "error"; message: string };

export type ProgressListener = (e: ProgressEvent) => void;

export interface LiveUpdatesModuleLike {
  sync: (onProgress?: (percentage: number) => void) => Promise<{
    activeApplicationPathChanged?: boolean;
  }>;
  reload: () => Promise<void>;
}

export interface RunUpdateOptions {
  onProgress?: ProgressListener;
  /** Test seam: inject a custom Live Updates module. */
  liveUpdatesModule?: LiveUpdatesModuleLike;
}

function isNativeCap(): boolean {
  try {
    const cap = (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

async function loadLiveUpdates() {
  const moduleName = "@capacitor/live-updates";

  try {
    return await import(
      /* @vite-ignore */
      moduleName
    );
  } catch {
    return null;
  }
}

export interface UpdateResult {
  ok: boolean;
  applied: boolean;
  unsupported?: boolean;
  error?: string;
}

/**
 * Triggers a Live Updates sync. Emits progress events for the UI.
 * Resolves with a result describing the outcome; never throws.
 */
export async function runLiveUpdate(
  opts: RunUpdateOptions = {},
): Promise<UpdateResult> {
  const emit = opts.onProgress ?? (() => {});

  if (!isNativeCap()) {
    emit({ kind: "unsupported", reason: "Live Updates is only available in the installed app." });
    return { ok: false, applied: false, unsupported: true, error: "unsupported_platform" };
  }

  let mod: LiveUpdatesModuleLike;
  try {
    mod = opts.liveUpdatesModule ?? (await loadLiveUpdates());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Live Updates.";
    log.error("update", "import live-updates failed", e);
    emit({ kind: "error", message: msg });
    return { ok: false, applied: false, error: msg };
  }

  emit({ kind: "start" });
  // Indeterminate progress: the plugin doesn't expose granular events
  // for sync(). We tick a couple of intermediate steps so the UI feels
  // alive without lying about real bytes-downloaded numbers.
  emit({ kind: "progress", percent: 10 });

  try {
    const result = await mod.sync((percentage: number) => {
      // The plugin reports 0..1; rescale to 10..90 so our start/end
      // ticks (0 and 100) bracket the real progress.
      const scaled = Math.max(0, Math.min(1, percentage));
      emit({ kind: "progress", percent: Math.round(10 + scaled * 80) });
    });
    emit({ kind: "progress", percent: 90 });

    if (result?.activeApplicationPathChanged) {
      emit({ kind: "applied" });
      return { ok: true, applied: true };
    }
    // No update was available, or sync did nothing.
    emit({ kind: "progress", percent: 100 });
    return { ok: true, applied: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed.";
    log.error("update", "LiveUpdates.sync failed", e);
    emit({ kind: "error", message: msg });
    return { ok: false, applied: false, error: msg };
  }
}

/**
 * Reload the app so a freshly synced bundle becomes active.
 */
export async function reloadAfterUpdate(): Promise<void> {
  if (!isNativeCap()) {
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    const mod = await loadLiveUpdates();
    await mod.reload();
  } catch (e) {
    log.error("update", "reload failed", e);
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Open a URL in the system browser as a fallback path (when Live
 * Updates is unsupported, or the user prefers a manual install).
 */
export function openExternal(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    log.warn("update", "openExternal failed", e);
  }
}
