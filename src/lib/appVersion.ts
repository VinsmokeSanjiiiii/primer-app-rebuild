// Local app version, injected at build time from package.json via vite `define`.
// Keep this in sync with android/app/build.gradle `versionName`.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __APP_VERSION__ !== "undefined" && (__APP_VERSION__ as any)) ||
  (import.meta.env.VITE_APP_VERSION as string) ||
  "1.0.0";

export interface LocalVersion {
  version: string;
  build?: string | number;
  platform?: string;
}

export interface NormalizedRemoteVersion {
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  releaseNotes?: string[];
  downloadUrl?: string;
  updatedAt?: number | string;
}

export interface UpdateDecision {
  status: "ok" | "optional" | "forced";
  localVersion: string;
  remoteVersion?: string;
  minimumVersion?: string;
}

function stripLeadingV(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function parseVersionParts(value: string): number[] {
  const cleaned = stripLeadingV(value);
  return cleaned
    .split(/[.\-+]/)
    .map((segment) => {
      const n = parseInt(segment, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Compares two semver-ish strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Backwards-compatible alias used by the test suite and older callers. */
export const compareSemver = compareVersions;

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toStringArray(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

function normalizeRemoteObject(raw: Record<string, unknown>): NormalizedRemoteVersion | null {
  const latestVersion =
    toNonEmptyString(raw.latestVersion) ??
    toNonEmptyString(raw.currentVersion) ??
    toNonEmptyString(raw.version) ??
    toNonEmptyString(raw.current_version);
  if (!latestVersion) return null;

  const minimumVersion =
    toNonEmptyString(raw.minimumVersion) ??
    toNonEmptyString(raw.minimumSupportedVersion) ??
    toNonEmptyString(raw.minimum_version) ??
    latestVersion;

  const releaseNotes = toStringArray(raw.releaseNotes) ?? toStringArray(raw.release_notes);

  const downloadUrl =
    toNonEmptyString(raw.downloadUrl) ??
    toNonEmptyString(raw.androidDownloadUrl) ??
    toNonEmptyString(raw.download_url);

  const updatedAt =
    typeof raw.updatedAt === "number" || typeof raw.updatedAt === "string"
      ? raw.updatedAt
      : typeof raw.updated_at === "number" || typeof raw.updated_at === "string"
        ? raw.updated_at
        : undefined;

  return {
    latestVersion,
    minimumVersion,
    forceUpdate: Boolean(raw.forceUpdate ?? raw.force_update ?? raw.mandatory ?? raw.is_mandatory),
    releaseNotes,
    downloadUrl: downloadUrl ?? undefined,
    updatedAt,
  };
}

export function normalizeRemoteVersion(
  raw: unknown,
): NormalizedRemoteVersion | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const version = raw.trim();
    if (!version) return null;
    return {
      latestVersion: version,
      minimumVersion: version,
      forceUpdate: false,
      releaseNotes: undefined,
      downloadUrl: undefined,
      updatedAt: undefined,
    };
  }

  if (typeof raw !== "object") return null;
  return normalizeRemoteObject(raw as Record<string, unknown>);
}

export function decideUpdateState(
  local: LocalVersion,
  remote: NormalizedRemoteVersion | null,
): UpdateDecision {
  if (!remote) {
    return { status: "ok", localVersion: local.version };
  }

  const latestCmp = compareVersions(local.version, remote.latestVersion);
  const minimumCmp = compareVersions(local.version, remote.minimumVersion);

  if (remote.forceUpdate) {
    return {
      status: "forced",
      localVersion: local.version,
      remoteVersion: remote.latestVersion,
      minimumVersion: remote.minimumVersion,
    };
  }

  if (latestCmp >= 0) {
    return {
      status: "ok",
      localVersion: local.version,
      remoteVersion: remote.latestVersion,
      minimumVersion: remote.minimumVersion,
    };
  }

  if (minimumCmp < 0) {
    return {
      status: "forced",
      localVersion: local.version,
      remoteVersion: remote.latestVersion,
      minimumVersion: remote.minimumVersion,
    };
  }

  return {
    status: "optional",
    localVersion: local.version,
    remoteVersion: remote.latestVersion,
    minimumVersion: remote.minimumVersion,
  };
}
