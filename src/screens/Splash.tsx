import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { APP_VERSION } from "../lib/appVersion";

const SESSION_KEY = "primer_portal_session";

/**
 * One-shot splash. Animation is cosmetic only — it does NOT gate readiness.
 *
 * - Guarded with a ref so StrictMode double-invocation / parent re-renders
 *   cannot restart the timer (previous bug: progress looped because the
 *   effect depended on `onDone`, which was a fresh function each render).
 * - Always calls `onDone` exactly once, within a hard cap (~2.5s) even if
 *   the visible steps are skipped or interrupted.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Checking connection…");
  const [online] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  // Stable ref to onDone so the effect can run with an empty dep array.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // One-shot guard — survives StrictMode's double mount in dev.
  const startedRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const hasSession = (() => {
      try {
        return !!(
          localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
        );
      } catch {
        return false;
      }
    })();

    const steps: { p: number; s: string }[] = [
      { p: 20, s: online ? "Connection verified." : "Starting in offline mode…" },
      { p: 45, s: "Verifying device…" },
      { p: 65, s: hasSession ? "Restoring secure session…" : "Loading secure session…" },
      { p: 85, s: "Preparing your workspace…" },
      { p: 100, s: "Ready" },
    ];

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onDoneRef.current();
    };

    let i = 0;
    const interval = window.setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i].p);
        setStatus(steps[i].s);
        i++;
      } else {
        window.clearInterval(interval);
        window.setTimeout(finish, 200);
      }
    }, 350);

    // Hard cap: never stay on the splash longer than ~2.5s, regardless.
    const cap = window.setTimeout(() => {
      window.clearInterval(interval);
      setProgress(100);
      setStatus("Ready");
      finish();
    }, 2500);

    return () => {
      // Reset guards so React 18 StrictMode's second mount can re-run.
      startedRef.current = false;
      finishedRef.current = false;
      window.clearInterval(interval);
      window.clearTimeout(cap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-10 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 shadow-xl ring-1 ring-white/30 backdrop-blur">
          <Icon name="shield" size={42} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">Primer Communications</h1>
          <p className="text-sm text-white/80">Employee Self-Service</p>
        </div>
      </div>

      <div className="w-full max-w-xs">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/85">
          <Icon name={online ? "wifi" : "alert"} size={14} />
          {status}
        </div>
      </div>
      <p className="absolute bottom-3 text-[10px] text-white/30 tracking-wider">v{APP_VERSION}</p>
    </div>
  );
}
