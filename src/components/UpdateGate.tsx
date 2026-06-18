import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  checkForUpdate,
  downloadAndInstallApk,
  type UpdateCheckResult,
} from "../lib/updateCheck";

/**
 * Full-screen, non-dismissible update gate.
 *
 * When the remote `app_version_control.current_version` is newer than the
 * local APP_VERSION AND `is_mandatory === true`, this overlay blocks all
 * interaction with the app until the user installs the new APK.
 *
 * Fails open: if Firebase is unreachable, `result` stays null and children
 * render normally — a network outage can never brick the app.
 */
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void checkForUpdate().then((r) => {
        if (!cancelled) setResult(r);
      });
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const blocking = !!(result?.updateAvailable && result.mandatory);

  const startUpdate = async () => {
    if (!result) return;
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadAndInstallApk(result.downloadUrl, (p) => setProgress(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed. Please try again.");
      setDownloading(false);
    }
  };

  return (
    <>
      {children}
      {blocking && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-5 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-required-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Icon name="download" size={30} />
              </div>
              <h2
                id="update-required-title"
                className="text-xl font-extrabold text-slate-900 dark:text-white"
              >
                Update Required
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                A new version of Primer Communications is available. Please
                update to continue using the app.
              </p>

              <div className="mt-4 flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
                <span>Current</span>
                <span className="font-mono">{result?.localVersion}</span>
                <Icon name="chevron" size={14} />
                <span>Latest</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-300">
                  {result?.remoteVersion}
                </span>
              </div>

              {result?.releaseNotes && (
                <p className="mt-3 w-full rounded-xl bg-slate-50 px-4 py-2 text-left text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  {result.releaseNotes}
                </p>
              )}

              {downloading && (
                <div className="mt-5 w-full">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Downloading… {progress}%
                  </p>
                </div>
              )}

              {error && (
                <p className="mt-3 w-full rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  {error}
                </p>
              )}

              <button
                onClick={startUpdate}
                disabled={downloading}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {downloading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    Installing…
                  </>
                ) : (
                  <>
                    <Icon name="download" size={18} />
                    Update Now
                  </>
                )}
              </button>

              <p className="mt-3 text-[11px] text-slate-400">
                This update is mandatory and cannot be skipped.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
