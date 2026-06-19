/**
 * App-version service.
 *
 * Single source of truth for: reading the local app version, fetching
 * the remote `/AppVersion` node, normalizing legacy vs new shapes,
 * comparing semantic versions, deciding whether the app is up-to-date /
 * optionally outdated / hard-locked, and syncing the client snapshot
 * back to the database under `/AppVersion/clients/<bindingId>` — never
 * over the global release record.
 *
 * Every step is wrapped to fail safe: any unexpected error returns
 * "ok" so the rest of the app keeps working.
 */

import { getDb } from "../data/firebase";
import { ref, get, update } from "firebase/database";
import { log } from "./log";

export interface LocalVersion {
  version: string;
  build: string;
  platform: "android" | "ios" | "web";
}

export interface NormalizedRemoteVersion {
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  releaseNotes: string[];
  downloadUrl: string | null;
  openUrl: string | null;
  platform: string | null;
  updatedAt: number | null;
}

export type UpdateStatus = "ok" | "optional" | "forced";

export interface UpdateDecision {
  status: UpdateStatus;
  local: LocalVersion;
  remote: NormalizedRemoteVersion | null;
}

const APP_VERSION_PATH = "/AppVersion";

// ---------------------------------------------------------------------------
// Local version
// ---------------------------------------------------------------------------

function isNativeCap(): boolean {
  try {
    const cap = (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }
    ).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function nativePlatform(): "android" | "ios" | "web" {
  try {
    const cap = (
      globalThis as { Capacitor?: { getPlatform?: () => string } }
    ).Capacitor;
    const p = cap?.getPlatform?.();
    if (p === "android") return "android";
    if (p === "ios") return "ios";
  } catch {
    /* ignore */
  }
  return "web";
}

/**
 * Reads the local app version. Prefers the Capacitor App plugin on
 * native; falls back to a build-time env value (`VITE_APP_VERSION`).
 */
export async function getLocalVersion(): Promise<LocalVersion> {
  const platform = nativePlatform();
  if (isNativeCap()) {
    try {
      const mod = await import("@capacitor/app");
      const info = await mod.App.getInfo();
      return {
        version: String(info?.version ?? "0.0.0"),
        build: String(info?.build ?? "0"),
        platform,
      };
    } catch (e) {
      log.warn("appVersion", "App.getInfo failed; falling back", e);
    }
  }
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    version: env.VITE_APP_VERSION ?? "0.0.0",
    build: env.VITE_APP_BUILD ?? "0",
    platform,
  };
}

// ---------------------------------------------------------------------------
// Remote read + normalize
// ---------------------------------------------------------------------------

/**
 * Accepts either the documented object shape:
 *   { latestVersion, minimumVersion, forceUpdate, releaseNotes, downloadUrl, ... }
 * or a legacy plain-string shape (just "1.2.3"). Missing fields are
 * filled with safe defaults. Returns null only when the input is
 * truly unrecognizable.
 */
export function normalizeRemoteVersion(
  raw: unknown,
): NormalizedRemoteVersion | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const v = raw.trim();
    if (!v) return null;
    return {
      latestVersion: v,
      minimumVersion: v,
      forceUpdate: false,
      releaseNotes: [],
      downloadUrl: null,
      openUrl: null,
      platform: null,
      updatedAt: null,
    };
  }

  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const latest =
    typeof o.latestVersion === "string"
      ? o.latestVersion
      : typeof o.version === "string"
      ? o.version
      : null;
  if (!latest) return null;

  const minimum =
    typeof o.minimumVersion === "string"
      ? o.minimumVersion
      : typeof o.minVersion === "string"
      ? o.minVersion
      : latest;

  let notes: string[] = [];
  if (Array.isArray(o.releaseNotes)) {
    notes = o.releaseNotes.filter((x): x is string => typeof x === "string");
  } else if (typeof o.releaseNotes === "string") {
    notes = [o.releaseNotes];
  }

  return {
    latestVersion: latest,
    minimumVersion: minimum,
    forceUpdate: o.forceUpdate === true,
    releaseNotes: notes,
    downloadUrl: typeof o.downloadUrl === "string" ? o.downloadUrl : null,
    openUrl: typeof o.openUrl === "string" ? o.openUrl : null,
    platform: typeof o.platform === "string" ? o.platform : null,
    updatedAt:
      typeof o.updatedAt === "number"
        ? o.updatedAt
        : typeof o.updatedAt === "string" && !Number.isNaN(Number(o.updatedAt))
        ? Number(o.updatedAt)
        : null,
  };
}

export async function fetchRemoteVersion(): Promise<NormalizedRemoteVersion | null> {
  try {
    const snap = await get(ref(getDb(), APP_VERSION_PATH));
    if (!snap.exists()) {
      log.info("appVersion", "no remote AppVersion node");
      return null;
    }
    const raw = snap.val();
    // Strip the `clients` map before normalizing — it's a child node,
    // not part of the release record.
    if (raw && typeof raw === "object" && "clients" in raw) {
      const { clients: _ignored, ...rest } = raw as Record<string, unknown>;
      void _ignored;
      return normalizeRemoteVersion(rest);
    }
    return normalizeRemoteVersion(raw);
  } catch (e) {
    log.warn("appVersion", "fetchRemoteVersion failed", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Semver compare
// ---------------------------------------------------------------------------

function parseSemver(v: string): number[] {
  const cleaned = v.replace(/^v/i, "").split(/[-+]/)[0];
  return cleaned
    .split(".")
    .map((seg) => {
      const n = parseInt(seg, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/**
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Treats `1.10.0` as newer than `1.2.0`. Missing segments are 0.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function compareBuild(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export function decideUpdateState(
  local: LocalVersion,
  remote: NormalizedRemoteVersion | null,
): UpdateDecision {
  if (!remote) return { status: "ok", local, remote: null };

  try {
    const vsMin = compareSemver(local.version, remote.minimumVersion);
    if (vsMin < 0) {
      return { status: "forced", local, remote };
    }
    let vsLatest = compareSemver(local.version, remote.latestVersion);
    if (vsLatest === 0) {
      // Tiebreaker: build number when present.
      vsLatest = compareBuild(local.build, "0");
      // We don't know the remote build; treat equal semver as up-to-date.
      vsLatest = 0;
    }
    if (vsLatest < 0) {
      return {
        status: remote.forceUpdate ? "forced" : "optional",
        local,
        remote,
      };
    }
    return { status: "ok", local, remote };
  } catch (e) {
    log.warn("appVersion", "decideUpdateState failed; defaulting to ok", e);
    return { status: "ok", local, remote };
  }
}

// ---------------------------------------------------------------------------
// Client sync
// ---------------------------------------------------------------------------

export async function syncClientVersion(
  bindingId: string,
  local: LocalVersion,
): Promise<void> {
  if (!bindingId) return;
  try {
    const payload = {
      installedVersion: local.version,
      buildNumber: local.build,
      platform: local.platform,
      lastSeenAt: Date.now(),
    };
    // `update()` against the child path — never overwrites siblings.
    await update(
      ref(getDb(), `${APP_VERSION_PATH}/clients/${bindingId}`),
      payload,
    );
    log.debug("appVersion", "client snapshot synced", payload);
  } catch (e) {
    log.warn("appVersion", "syncClientVersion failed", e);
  }
}

// ---------------------------------------------------------------------------
// Per-version dismissal so optional updates don't nag every launch.
// ---------------------------------------------------------------------------

const DISMISS_KEY = "primer_update_dismissed_v1";

export function isVersionDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

export function dismissVersion(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* ignore */
  }
}

export function clearDismissed(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
