import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useApp } from "../store";

/**
 * Splash screen driven by a real startup state machine. The store
 * exposes `runStartupChecks()` which executes:
 *   1. resolve device binding id
 *   2. load local app version
 *   3. fetch remote /AppVersion node
 *   4. compare versions and stash the decision in the store
 *   5. fire-and-forget sync the client snapshot to RTDB
 *   6. restore session from prior repository state
 *
 * Each step updates a status string we render here. Failures fall
 * through to a generic "ready" outcome so the app keeps working
 * when the network or version node is broken.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const { runStartupChecks } = useApp();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Starting…");
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await runStartupChecks((step) => {
          if (cancelled) return;
          setStatus(step.label);
          setProgress(step.progress);
        });
      } catch {
        // Never block the app on startup-check failure.
        if (!cancelled) setStatus("Ready");
      }
      if (cancelled) return;
      setProgress(100);
      // Tiny delay so the final status has a chance to render.
      setTimeout(() => {
        if (!cancelled) onDone();
      }, 220);
    })();
    return () => {
      cancelled = true;
    };
  }, [runStartupChecks, onDone]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-10 text-white">
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
    </div>
  );
}
