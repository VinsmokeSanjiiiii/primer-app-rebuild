// Canonical app-version check.
//
// Reads RTDB `AppVersion` (canonical). Falls back to the legacy
// `app_version_control` node if `AppVersion` is missing, so existing
// production data keeps working during migration.
//
// Hardened:
//   - per-attempt timeout (6s)
//   - 2 bounded retries with linear backoff
//   - last-good payload cached in localStorage
//   - never throws; always returns a discriminated result
//   - malformed remote → treated as non-mandatory, with a warning surfaced
//     via the returned `warning` field
//
// Acknowledgement tracking lives in this module too so the rest of the
// app can ask "did the user already see this version?" without depending
// on the gate UI.

import { get, ref, set, serverTimestamp } from "firebase/database";
import { getDb } from "../data/firebase";
import { APP_VERSION, compareVersions } from "./appVersion";
import { getDeviceId } from "./deviceBinding";

const PRIMARY_PATH = "AppVersion";
const LEGACY_PATH = "app_version_control";

const CACHE_KEY = "pulse.appVersion.cache.v1";
const ACK_KEY = "pulse.appVersion.ack.v1";

const READ_TIMEOUT_MS = 6_000;
const MAX_ATTEMPTS = 3;

/** Normalised, internal version-state shape. */
export interface AppVersionInfo {
  currentVersion: string;
  minimumSupportedVersion?: string;
  mandatory: boolean;
  androidDownloadUrl?: string;
  releaseNotes?: string;
  releasePageUrl?: string;
  checksum?: string;
  buildNumber?: number;
  updatedAt?: number | string;
  status?: string;
  ackRequired?: boolean;
}

export interface UpdateCheckResult {
  ok: boolean;
  updateAvailable: boolean;
  mandatory: boolean;
  localVersion: string;
  info?: AppVersionInfo;
  source: "primary" | "legacy" | "cache" | "none";
  warning?: string;
  error?: string;
}

interface CachedPayload {
  info: AppVersionInfo;
  source: "primary" | "legacy";
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function readCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed?.info?.currentVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(info: AppVersionInfo, source: "primary" | "legacy"): void {
  try {
    const payload: CachedPayload = { info, source, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function sanitizeVersion(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  // Strip leading "v" and any obviously invalid characters.
  return trimmed.replace(/^v/i, "").replace(/[^0-9a-zA-Z.\-+]/g, "");
}

function normalise(raw: unknown, source: "primary" | "legacy"): AppVersionInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Accept both canonical AppVersion shape and legacy snake_case shape.
  const currentVersion =
    sanitizeVersion(r.currentVersion) ?? sanitizeVersion(r.current_version);
  if (!currentVersion) return null;

  const info: AppVersionInfo = {
    currentVersion,
    minimumSupportedVersion:
      sanitizeVersion(r.minimumSupportedVersion) ??
      sanitizeVersion(r.minimum_supported_version),
    mandatory: !!(r.mandatory ?? r.is_mandatory),
    androidDownloadUrl:
      typeof r.androidDownloadUrl === "string"
        ? r.androidDownloadUrl
        : typeof r.download_url === "string"
          ? r.download_url
          : undefined,
    releaseNotes:
      typeof r.releaseNotes === "string"
        ? r.releaseNotes
        : typeof r.release_notes === "string"
          ? r.release_notes
          : undefined,
    releasePageUrl:
      typeof r.releasePageUrl === "string"
        ? r.releasePageUrl
        : typeof r.release_page_url === "string"
          ? r.release_page_url
          : undefined,
    checksum:
      typeof r.checksum === "string"
        ? r.checksum
        : typeof r.sha256 === "string"
          ? r.sha256
          : undefined,
    buildNumber:
      typeof r.buildNumber === "number"
        ? r.buildNumber
        : typeof r.build_number === "number"
          ? r.build_number
          : undefined,
    updatedAt:
      typeof r.updatedAt === "number" || typeof r.updatedAt === "string"
        ? r.updatedAt
        : typeof r.updated_at === "number" || typeof r.updated_at === "string"
          ? (r.updated_at as number | string)
          : undefined,
    status: typeof r.status === "string" ? r.status : undefined,
    ackRequired: !!(r.ackRequired ?? r.ack_required),
  };
  // Source-derived hint for callers; not persisted to RTDB.
  void source;
  return info;
}

// ---------------------------------------------------------------------------
// RTDB read with timeout + retry
// ---------------------------------------------------------------------------

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function readPath(path: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const snap = await withTimeout(get(ref(getDb(), path)), READ_TIMEOUT_MS);
      return snap.val();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastErr ?? new Error("read failed");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a final result from a normalised payload. */
function buildResult(
  info: AppVersionInfo,
  source: "primary" | "legacy" | "cache",
): UpdateCheckResult {
  let updateAvailable = false;
  let warning: string | undefined;
  try {
    updateAvailable = compareVersions(info.currentVersion, APP_VERSION) > 0;
  } catch {
    warning = "Version comparison failed; treating as up-to-date.";
  }
  // Mandatory is only enforced when remote explicitly says so AND
  // the local version is below the minimum-supported value if provided.
  let mandatory = false;
  if (info.mandatory) {
    if (info.minimumSupportedVersion) {
      try {
        mandatory =
          compareVersions(APP_VERSION, info.minimumSupportedVersion) < 0;
      } catch {
        mandatory = false;
        warning =
          "Minimum supported version is malformed; mandatory enforcement skipped.";
      }
    } else {
      mandatory = updateAvailable;
    }
  }

  return {
    ok: true,
    updateAvailable,
    mandatory,
    localVersion: APP_VERSION,
    info,
    source,
    warning,
  };
}

/**
 * Reads the canonical `AppVersion` node, falling back to the legacy node
 * and finally to the local cache. Never throws.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  // 1. Try canonical path.
  try {
    const raw = await readPath(PRIMARY_PATH);
    const info = normalise(raw, "primary");
    if (info) {
      writeCache(info, "primary");
      return buildResult(info, "primary");
    }
  } catch {
    /* fall through to legacy */
  }

  // 2. Fall back to legacy path.
  try {
    const raw = await readPath(LEGACY_PATH);
    const info = normalise(raw, "legacy");
    if (info) {
      writeCache(info, "legacy");
      const result = buildResult(info, "legacy");
      result.warning =
        result.warning ??
        "Using legacy app_version_control node — please migrate to AppVersion.";
      return result;
    }
  } catch {
    /* fall through to cache */
  }

  // 3. Fall back to local cache if available.
  const cached = readCache();
  if (cached) {
    const result = buildResult(cached.info, "cache");
    result.warning =
      result.warning ?? "Using cached version info — network unavailable.";
    return result;
  }

  return {
    ok: false,
    updateAvailable: false,
    mandatory: false,
    localVersion: APP_VERSION,
    source: "none",
    error: "Version check unavailable; continuing in offline-safe mode.",
  };
}

// ---------------------------------------------------------------------------
// Acknowledgement tracking
// ---------------------------------------------------------------------------

export type AckSource =
  | "update_modal"
  | "release_page"
  | "post_install_check";

interface LocalAck {
  version: string;
  acknowledgedAt: number;
  source: AckSource;
}

function readLocalAcks(): Record<string, LocalAck> {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) ?? "{}") as Record<
      string,
      LocalAck
    >;
  } catch {
    return {};
  }
}

function writeLocalAck(ack: LocalAck): void {
  try {
    const all = readLocalAcks();
    all[ack.version] = ack;
    localStorage.setItem(ACK_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function isAcknowledged(version: string): boolean {
  const v = sanitizeVersion(version);
  if (!v) return false;
  return !!readLocalAcks()[v];
}

/**
 * Records that the user has seen a version prompt. Best-effort syncs to
 * RTDB; always writes the local cache so offline launches don't re-prompt.
 *
 * NOTE: ack does NOT bypass a mandatory update — callers must still check
 * `result.mandatory` separately.
 */
export async function acknowledgeVersion(
  version: string,
  source: AckSource,
  employeeId?: string,
): Promise<void> {
  const v = sanitizeVersion(version);
  if (!v) return;
  const acknowledgedAt = Date.now();
  writeLocalAck({ version: v, acknowledgedAt, source });

  // Best-effort remote write — never throw.
  try {
    const deviceId = getDeviceId();
    const safeVersion = v.replace(/[.#$/[\]]/g, "_");
    await set(
      ref(getDb(), `AppVersionAcknowledgements/${safeVersion}/${deviceId}`),
      {
        version: v,
        employeeId: employeeId ?? null,
        deviceId,
        acknowledgedAt: serverTimestamp(),
        source,
      },
    );
  } catch {
    /* offline / permissions — local cache is enough */
  }
}

// ---------------------------------------------------------------------------
// Re-exports for legacy callers
// ---------------------------------------------------------------------------

export { downloadAndInstallApk } from "./updateInstall";
