// Standalone OTA release-page screen.
//
// Used as a recovery path when in-app update install fails (no APK download,
// no installer permission, checksum mismatch, etc.). The UpdateGate routes
// here automatically via the `fallbackAvailable` boot state, but this
// component is also exported so it can be opened directly from menus.

import { useState } from "react";
import { Icon } from "../components/Icon";
import { APP_VERSION } from "../lib/appVersion";
import type { AppVersionInfo } from "../lib/updateCheck";

export function ReleasePage({
  info,
  reason,
  onRetry,
  onClose,
}: {
  info?: AppVersionInfo;
  reason?: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const url = info?.releasePageUrl ?? info?.androidDownloadUrl;
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
  const open = () => {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <Icon name="chevron" size={18} />
          </button>
        )}
        <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
          Release & manual update
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <Icon name="alert" size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {reason
                  ? "Automatic install couldn't finish"
                  : "Install the latest version"}
              </h2>
              {reason && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {reason}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-white/5">
              <div className="text-[10px] font-semibold uppercase text-slate-400">
                Installed
              </div>
              <div className="mt-0.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                {APP_VERSION}
              </div>
            </div>
            <div className="rounded-xl bg-indigo-50 px-3 py-2 dark:bg-indigo-500/10">
              <div className="text-[10px] font-semibold uppercase text-indigo-500 dark:text-indigo-300">
                Latest
              </div>
              <div className="mt-0.5 font-mono font-bold text-indigo-700 dark:text-indigo-200">
                {info?.currentVersion ?? "—"}
              </div>
            </div>
          </div>

          {info?.releaseNotes && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                What's new
              </h3>
              <p className="mt-1 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
                {info.releaseNotes}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
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
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  <Icon name="refresh" size={14} />
                  Try automatic again
                </button>
              )}
              {url && (
                <button
                  onClick={copy}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  <Icon name={copied ? "check" : "info"} size={14} />
                  {copied ? "Copied" : "Copy link"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">
              Install instructions
            </p>
            <ol className="mt-1 list-decimal pl-4 leading-relaxed">
              <li>Download the APK using the button above.</li>
              <li>Open the downloaded file from your Notifications or Downloads folder.</li>
              <li>If Android blocks it, allow installs from this source and tap Install again.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
