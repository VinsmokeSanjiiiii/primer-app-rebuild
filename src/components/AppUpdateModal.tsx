/**
 * Reusable update gate modal.
 *
 * Sits above the entire app shell. Renders only when the update
 * decision says `optional` or `forced`. For `forced`, the modal
 * cannot be dismissed — there is no "Later" button.
 *
 * Drives `runLiveUpdate()` for OTA, surfaces progress, and offers a
 * fallback (open in system browser) when Live Updates is unsupported
 * (typically web) or when the OTA sync fails.
 */

import { useEffect, useState } from "react";
import type { UpdateDecision } from "../lib/appVersion";
import {
  type ProgressEvent,
  openExternal,
  reloadAfterUpdate,
  runLiveUpdate,
} from "../lib/updateDownload";
import { Icon } from "./Icon";

interface Props {
  decision: UpdateDecision;
  onDismiss?: () => void;
}

type Phase = "idle" | "downloading" | "applied" | "error" | "unsupported";

export function AppUpdateModal({ decision, onDismiss }: Props) {
  const { remote, status, local } = decision;
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-run the update flow when the decision changes (e.g. a new
  // version arrives while the modal is already open).
  useEffect(() => {
    setPhase("idle");
    setPercent(0);
    setErrorMsg(null);
  }, [remote?.latestVersion]);

  if (!remote) return null;

  const onProgress = (e: ProgressEvent) => {
    switch (e.kind) {
      case "start":
        setPhase("downloading");
        setPercent(0);
        setErrorMsg(null);
        break;
      case "progress":
        setPercent(e.percent);
        break;
      case "applied":
        setPhase("applied");
        setPercent(100);
        break;
      case "unsupported":
        setPhase("unsupported");
        setErrorMsg(e.reason);
        break;
      case "error":
        setPhase("error");
        setErrorMsg(e.message);
        break;
    }
  };

  const startUpdate = async () => {
    const result = await runLiveUpdate({ onProgress });
    if (result.ok && !result.applied && phase !== "applied") {
      // Sync completed but no bundle changed — treat as "you're up to
      // date" rather than an error.
      setPhase("applied");
      setPercent(100);
    }
  };

  const handleReload = async () => {
    await reloadAfterUpdate();
  };

  const handleFallback = () => {
    if (remote.openUrl) openExternal(remote.openUrl);
    else if (remote.downloadUrl) openExternal(remote.downloadUrl);
  };

  const forced = status === "forced";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              {forced ? "Update required" : "Update available"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {local.version} → {remote.latestVersion}
            </p>
          </div>
        </div>

        {remote.releaseNotes.length > 0 && (
          <ul className="mb-3 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-slate-600 dark:text-slate-300">
            {remote.releaseNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}

        {phase === "downloading" && (
          <div className="mb-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              Downloading update… {percent}%
            </p>
          </div>
        )}

        {phase === "applied" && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            Update ready. Reload to apply.
          </p>
        )}

        {(phase === "error" || phase === "unsupported") && errorMsg && (
          <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {phase === "applied" ? (
            <button
              onClick={handleReload}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Reload now
            </button>
          ) : phase === "downloading" ? (
            <button
              disabled
              className="w-full rounded-xl bg-indigo-300 py-2.5 text-sm font-semibold text-white"
            >
              Updating…
            </button>
          ) : phase === "unsupported" ? (
            <button
              onClick={handleFallback}
              disabled={!remote.openUrl && !remote.downloadUrl}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Open release page
            </button>
          ) : (
            <button
              onClick={startUpdate}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {phase === "error" ? "Retry update" : "Update now"}
            </button>
          )}

          {!forced && phase !== "applied" && (
            <button
              onClick={onDismiss}
              className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
