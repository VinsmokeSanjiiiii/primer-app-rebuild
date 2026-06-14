import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";

const SESSION_KEY = "primer_portal_session";

export function Splash({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [online] = useState(() => navigator.onLine);
  const [status, setStatus] = useState("Checking connection…");

  useEffect(() => {
    const hasSession = !!(
      localStorage.getItem(SESSION_KEY) ??
      sessionStorage.getItem(SESSION_KEY)
    );

    if (!online) {
      setStatus("No internet connection. Retrying…");
    }

    const steps = [
      { p: 20, s: online ? "Connection verified." : "Retrying connection…" },
      { p: 45, s: "Verifying device binding…" },
      { p: 65, s: hasSession ? "Restoring secure session…" : "Loading secure session…" },
      { p: 85, s: "Preparing your workspace…" },
      { p: 100, s: "Ready" },
    ];

    let i = 0;
    const t = setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i].p);
        setStatus(steps[i].s);
        i++;
      } else {
        clearInterval(t);
        setTimeout(onDone, 300);
      }
    }, 420);
    return () => clearInterval(t);
  }, [online, onDone]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-10 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 shadow-xl ring-1 ring-white/30 backdrop-blur">
          <Icon name="shield" size={42} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">Primer Communications</h1>
          <p className="text-sm text-white/80">Employee Self-Service Portal</p>
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
