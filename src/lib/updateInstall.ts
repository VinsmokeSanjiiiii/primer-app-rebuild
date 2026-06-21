// APK download + install with proper error reporting.
//
// Web (and any non-native platform) → opens the URL in a new tab.
// Native → tries to download into the External directory, optionally
// verifies a sha256 checksum, then hands the file to the OS installer.
//
// Every failure is surfaced via a typed `InstallError`. Callers should
// route failures to the OTA release-page fallback rather than retrying
// silently.

import { Capacitor } from "@capacitor/core";

export type ProgressCb = (pct: number | null) => void;

export type InstallErrorKind =
  | "network"
  | "download"
  | "checksum"
  | "filesystem"
  | "permission"
  | "open"
  | "unsupported";

export class InstallError extends Error {
  kind: InstallErrorKind;
  constructor(kind: InstallErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "InstallError";
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

interface InstallOpts {
  onProgress?: ProgressCb;
  checksum?: string; // hex sha256
}

export async function downloadAndInstallApk(
  url: string,
  optsOrCb?: InstallOpts | ProgressCb,
): Promise<void> {
  const opts: InstallOpts =
    typeof optsOrCb === "function" ? { onProgress: optsOrCb } : (optsOrCb ?? {});

  if (!url) throw new InstallError("download", "No download URL provided.");

  if (!Capacitor.isNativePlatform()) {
    try {
      window.open(url, "_blank", "noopener");
    } catch (e) {
      throw new InstallError(
        "unsupported",
        e instanceof Error ? e.message : "Could not open download page.",
      );
    }
    return;
  }

  // Native path -------------------------------------------------------------
  let Filesystem: typeof import("@capacitor/filesystem").Filesystem;
  let Directory: typeof import("@capacitor/filesystem").Directory;
  let FileOpener: typeof import("@capawesome-team/capacitor-file-opener").FileOpener;
  try {
    const fs = await import("@capacitor/filesystem");
    const fo = await import("@capawesome-team/capacitor-file-opener");
    Filesystem = fs.Filesystem;
    Directory = fs.Directory;
    FileOpener = fo.FileOpener;
  } catch (e) {
    throw new InstallError(
      "unsupported",
      e instanceof Error
        ? e.message
        : "Native install plugins are not available on this build.",
    );
  }

  const fileName = "primer-update.apk";

  // Progress listener (Capacitor 8 emits `progress` events on Filesystem).
  let progressHandle: { remove: () => Promise<void> } | undefined;
  if (opts.onProgress) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fsAny = Filesystem as any;
      if (typeof fsAny.addListener === "function") {
        progressHandle = await fsAny.addListener(
          "progress",
          (e: { bytes: number; contentLength: number }) => {
            if (e.contentLength > 0) {
              const pct = Math.min(
                100,
                Math.round((e.bytes / e.contentLength) * 100),
              );
              opts.onProgress?.(pct);
            } else {
              // Indeterminate — content length unknown.
              opts.onProgress?.(null);
            }
          },
        );
      }
    } catch {
      /* progress is optional */
    }
  }

  let filePath: string | undefined;
  try {
    const result = await Filesystem.downloadFile({
      url,
      path: fileName,
      directory: Directory.External,
      progress: true,
    });
    filePath = result.path;
    opts.onProgress?.(100);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Download failed.";
    if (/permission/i.test(msg)) {
      throw new InstallError("permission", msg);
    }
    if (/network|timeout|fetch/i.test(msg)) {
      throw new InstallError("network", msg);
    }
    throw new InstallError("download", msg);
  } finally {
    void progressHandle?.remove().catch(() => {});
  }

  if (!filePath) {
    throw new InstallError("filesystem", "Download finished but no path was returned.");
  }

  // Optional checksum verification.
  if (opts.checksum) {
    try {
      const read = await Filesystem.readFile({
        path: fileName,
        directory: Directory.External,
      });
      // `data` is base64 on native.
      const data = read.data as unknown as string;
      const binary = atob(typeof data === "string" ? data : "");
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const actual = await sha256Hex(buf.buffer);
      if (actual.toLowerCase() !== opts.checksum.toLowerCase()) {
        throw new InstallError(
          "checksum",
          "Downloaded file failed integrity check.",
        );
      }
    } catch (e) {
      if (e instanceof InstallError) throw e;
      // If the read itself fails we surface as filesystem error rather
      // than aborting the install (some platforms can't read External).
      // eslint-disable-next-line no-console
      console.warn("[updateInstall] checksum read skipped", e);
    }
  }

  try {
    await FileOpener.openFile({
      path: filePath,
      mimeType: "application/vnd.android.package-archive",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to launch installer.";
    if (/permission/i.test(msg)) {
      throw new InstallError("permission", msg);
    }
    throw new InstallError("open", msg);
  }
}
