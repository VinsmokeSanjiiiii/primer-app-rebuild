import { useCallback, useState } from "react";
import { Icon } from "./Icon";
import {
  bootController,
  useStartupVersionCheck,
  type BootState,
} from "../lib/bootState";
import { downloadAndInstallApk, InstallError } from "../lib/updateInstall";
import { Capacitor } from "@capacitor/core";

/**
 * Update gate driven by the central boot state machine.
 *
 * - Never blocks children unless the controller is in `mandatoryUpdate`,
 *   `downloading`, `installing`, or `fallbackAvailable` after a mandatory
 *   update has been confirmed.
 * - On any download/install failure we transition to the OTA release-page
 *   fallback instead of looping silent retries.
 */
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const state = useStartupVersionCheck();
  const { status, info, result, progress, errorMessage, warning } = state;

  // Local UI flag for "Later" on non-mandatory prompts during this session.
  const [dismissed, setDismissed] = useState(false);

  // On web (non-native), we never hard-block: APK download doesn't apply in a browser.
  const isNative = Capacitor.isNativePlatform();
  const blocking =
    isNative &&
    !!result?.mandatory &&
    (status === "mandatoryUpdate" ||
      status === "downloading" ||
      status === "installing" ||
      status === "fallbackAvailable" ||
      status === "error");

  const showPrompt =
    !dismissed &&
    !blocking &&
    status === "updateAvailable" &&
    !!info?.androidDownloadUrl;

  const startUpdate = useCallback(async () => {
    if (!info?.androidDownloadUrl) {
      bootController.setFallback("No download URL provided by the server.");
      return;
    }
    bootController.setDownloading(0);
    try {
      await downloadAndInstallApk(info.androidDownloadUrl, {
        onProgress: (pct) => bootController.setDownloading(pct),
        checksum: info.checksum,
      });
      bootController.setInstalling();
    } catch (e) {
      const message =
        e instanceof InstallError
          ? `${describeKind(e.kind)} ${e.message}`
          : e instanceof Error
            ? e.message
            : "Update failed.";
      bootController.setFallback(message);
    }
  }, [info?.androidDownloadUrl, info?.checksum]);

  const retryCheck = useCallback(() => {
    void bootController.check();
  }, []);

  const dismiss = useCallback(() => {
    if (blocking) return;
    setDismissed(true);
    void bootController.acknowledge();
  }, [blocking]);

  return (
    <>
      {children}
      {(showPrompt || blocking) && (
        <UpdateModal
          state={state}
          progress={progress}
          warning={warning}
          errorMessage={errorMessage}
          onUpdate={startUpdate}
          onDismiss={dismiss}
          onRetry={retryCheck}
          mandatory={blocking}
        />
      )}
    </>
  );
}

function describeKind(kind: InstallError["kind"]): string {
  switch (kind) {
    case "network":
      return "Network issue while downloading the update:";
    case "download":
      return "Couldn't download the update:";
    case "checksum":
      return "Downloaded file failed integrity check:";
    case "filesystem":
      return "Couldn't save the update file:";
    case "permission":
      return "Missing permission to install:";
    case "open":
      return "Couldn't launch the installer:";
    case "unsupported":
      return "Updates aren't supported on this device:";
  }
}

function UpdateModal({
  state,
  progress,
  warning,
  errorMessage,
  onUpdate,
  onDismiss,
  onRetry,
  mandatory,
}: {
  state: BootState;
  progress: number | null;
  warning?: string;
  errorMessage?: string;
  onUpdate: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  mandatory: boolean;
}) {
  const { info, status, result } = state;
  const downloading = status === "downloading";
  const installing = status === "installing";
  const fallback = status === "fallbackAvailable";

  const releaseUrl = info?.releasePageUrl ?? info?.androidDownloadUrl;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Icon name={fallback ? "alert" : "download"} size={30} />
          </div>
          <h2
            id="update-dialog-title"
            className="text-xl font-extrabold text-slate-900 dark:text-white"
          >
            {fallback
              ? "Manual update needed"
              : mandatory
                ? "Update Required"
                : "Update Available"}
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {fallback
              ? "We couldn't install the update automatically. You can download it manually below."
              : installing
                ? "Launching the installer…"
                : downloading
                  ? "Downloading the latest version…"
                  : mandatory
                    ? "A new version is required to continue."
                    : "A new version of Primer Communications is available."}
          </p>

          <div className="mt-4 flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <span>Current</span>
            <span className="font-mono">{result?.localVersion}</span>
            <Icon name="chevron" size={14} />
            <span>Latest</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-300">
              {info?.currentVersion ?? "—"}
            </span>
          </div>

          {info?.releaseNotes && (
            <p className="mt-3 max-h-32 w-full overflow-y-auto rounded-xl bg-slate-50 px-4 py-2 text-left text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {info.releaseNotes}
            </p>
          )}

          {(downloading || installing) && (
            <div className="mt-5 w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                {progress == null ? (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-600" />
                ) : (
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {installing
                  ? "Opening installer…"
                  : progress == null
                    ? "Downloading…"
                    : `Downloading… ${progress}%`}
              </p>
            </div>
          )}

          {warning && !errorMessage && (
            <p className="mt-3 w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {warning}
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 w-full rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {errorMessage}
            </p>
          )}

          {!fallback && !installing && (
            <button
              onClick={onUpdate}
              disabled={downloading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {downloading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Updating…
                </>
              ) : (
                <>
                  <Icon name="download" size={18} />
                  Update Now
                </>
              )}
            </button>
          )}

          {fallback && (
            <ReleaseFallbackActions
              url={releaseUrl}
              onRetry={() => {
                onRetry();
                if (info?.androidDownloadUrl) onUpdate();
              }}
            />
          )}

          {!mandatory && !downloading && !installing && (
            <button
              onClick={onDismiss}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Later
            </button>
          )}

          {mandatory && (
            <p className="mt-3 text-[11px] text-slate-400">
              This update is mandatory and cannot be skipped.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReleaseFallbackActions({
  url,
  onRetry,
}: {
  url?: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const open = () => {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-4 flex w-full flex-col gap-2">
      {url && (
        <button
          onClick={open}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition active:scale-[0.98]"
        >
          <Icon name="download" size={18} />
          Open download page
        </button>
      )}
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <Icon name="refresh" size={14} />
          Retry
        </button>
        {url && (
          <button
            onClick={copy}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Icon name={copied ? "check" : "info"} size={14} />
            {copied ? "Copied" : "Copy link"}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        If the install screen doesn't appear after downloading, open the file
        from your Downloads folder and allow installs from this source.
      </p>
    </div>
  );
}
