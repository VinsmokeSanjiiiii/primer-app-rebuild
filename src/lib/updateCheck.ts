// Force-update enforcement: checks Firebase RTDB `/app_version_control` against
// the local APP_VERSION and (if needed) downloads + installs a new APK.
//
// Safe on web: download/install gracefully fall back to opening the URL.

import { Capacitor } from "@capacitor/core";
import { get, ref } from "firebase/database";
import { getDb } from "../data/firebase";
import { APP_VERSION, compareVersions } from "./appVersion";

export interface RemoteAppVersion {
  current_version: string;
  download_url: string;
  is_mandatory: boolean;
  release_notes?: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  mandatory: boolean;
  remoteVersion: string;
  localVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
}

const REMOTE_PATH = "app_version_control";

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const snap = await get(ref(getDb(), REMOTE_PATH));
    const data = snap.val() as RemoteAppVersion | null;
    if (!data || !data.current_version || !data.download_url) return null;
    const cmp = compareVersions(data.current_version, APP_VERSION);
    return {
      updateAvailable: cmp > 0,
      mandatory: !!data.is_mandatory,
      remoteVersion: data.current_version,
      localVersion: APP_VERSION,
      downloadUrl: data.download_url,
      releaseNotes: data.release_notes,
    };
  } catch (err) {
    // Fail open — never brick the app if RTDB is unreachable.
    // eslint-disable-next-line no-console
    console.warn("[updateCheck] failed", err);
    return null;
  }
}

export type ProgressCb = (pct: number) => void;

/**
 * Downloads the APK and launches the Android package installer.
 * On non-native platforms, opens the URL in a new tab.
 */
export async function downloadAndInstallApk(
  url: string,
  onProgress?: ProgressCb,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, "_blank");
    return;
  }

  // Dynamic imports so web bundles never try to evaluate native-only code.
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { FileOpener } = await import("@capawesome-team/capacitor-file-opener");

  const fileName = "primer-update.apk";

  // Listen for download progress (Capacitor 8 emits progress events).
  let progressHandle: { remove: () => Promise<void> } | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsAny = Filesystem as any;
    if (onProgress && typeof fsAny.addListener === "function") {
      progressHandle = await fsAny.addListener(
        "progress",
        (e: { bytes: number; contentLength: number }) => {
          if (e.contentLength > 0) {
            onProgress(Math.min(100, Math.round((e.bytes / e.contentLength) * 100)));
          }
        },
      );
    }

    const result = await Filesystem.downloadFile({
      url,
      path: fileName,
      directory: Directory.External,
      progress: true,
    });

    onProgress?.(100);

    const filePath = result.path;
    if (!filePath) throw new Error("Download finished but path is empty.");

    await FileOpener.openFile({
      path: filePath,
      mimeType: "application/vnd.android.package-archive",
    });
  } finally {
    if (progressHandle) {
      try {
        await progressHandle.remove();
      } catch {
        /* noop */
      }
    }
  }
}
