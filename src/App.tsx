import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";
import { Icon, type IconName } from "./components/Icon";
import { Splash } from "./screens/Splash";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Clock } from "./screens/Clock";
import { Attendance } from "./screens/Attendance";
import { LeaveRequest } from "./screens/LeaveRequest";
import { OTRequest } from "./screens/OTRequest";
import { TechCoverage } from "./screens/TechCoverage";
import { Coverage } from "./screens/Coverage";
import { Requests } from "./screens/Requests";
import { ChangeLeave } from "./screens/ChangeLeave";
import { CoverageRecords } from "./screens/CoverageRecords";
import { Infractions } from "./screens/Infractions";
import { Profile } from "./screens/Profile";
import { Notifications } from "./screens/Notifications";
import type { ScreenId } from "./types";
import { applySystemBars } from "./lib/systemBars";
import { UpdateGate } from "./components/UpdateGate";
import { LoadingState } from "./components/States";

const NAV: { id: ScreenId; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Home", icon: "home" },
  { id: "attendance", label: "Attendance", icon: "calendar" },
  { id: "requests", label: "Requests", icon: "inbox" },
  { id: "profile", label: "Profile", icon: "person" },
];

const SCREENS: Record<ScreenId, () => React.ReactElement> = {
  dashboard: Dashboard,
  clock: Clock,
  attendance: Attendance,
  leave: LeaveRequest,
  ot: OTRequest,
  tech: TechCoverage,
  coverage: Coverage,
  requests: Requests,
  "change-leave": ChangeLeave,
  "coverage-records": CoverageRecords,
  infractions: Infractions,
  profile: Profile,
  notifications: Notifications,
};

function Shell() {
  const { screen, navigate, isAuthed, toasts, hasHydrated, navBlur } = useApp();
  const Screen = SCREENS[screen];
  const showNav = (["dashboard", "attendance", "requests", "profile"] as ScreenId[]).includes(screen);

  const navClass = navBlur
    ? "bg-white/85 backdrop-blur-md dark:bg-slate-900/80"
    : "bg-white dark:bg-slate-900";

  return (
    <div className="flex h-full flex-col bg-slate-50 safe-top dark:bg-slate-950">
      <div className="flex-1 overflow-y-auto">
        {!hasHydrated ? (
          <LoadingState />
        ) : isAuthed ? (
          <Screen />
        ) : (
          <Login />
        )}
      </div>

      {/* Bottom nav */}
      {isAuthed && showNav && (
        <nav className={`flex items-center justify-around border-t border-slate-200/70 px-2 py-1.5 safe-bottom dark:border-white/10 ${navClass}`}>
          {NAV.map((n) => {
            const active = screen === n.id;
            return (
              <button
                key={n.id}
                onClick={() => navigate(n.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition ${
                  active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"
                }`}
              >
                <div className={`flex h-8 w-12 items-center justify-center rounded-full transition-all duration-200 ${active ? "bg-indigo-100 scale-105 dark:bg-indigo-500/15" : ""}`}>
                  <Icon name={n.icon} size={20} />
                </div>
                <span className="text-[10px] font-semibold">{n.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Toasts */}
      <div className="pointer-events-none absolute inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
              t.kind === "success" ? "bg-emerald-600" : t.kind === "error" ? "bg-rose-600" : "bg-slate-800"
            }`}
          >
            <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Root() {
  const { dark } = useApp();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.classList.add("dark");
    else el.classList.remove("dark");
    // Keep Android status / navigation bars in sync with the in-app theme.
    void applySystemBars(dark);
  }, [dark]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="flex min-h-screen items-center justify-center bg-slate-200 p-0 sm:p-6 dark:bg-slate-900">
        {/* Phone frame */}
        <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-50 shadow-2xl sm:h-[860px] sm:max-w-[420px] sm:rounded-[2.5rem] sm:ring-8 sm:ring-slate-900 dark:bg-slate-950">
          {!booted ? (
            <Splash onDone={() => setBooted(true)} />
          ) : (
            <Shell />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <UpdateGate>
        <Root />
      </UpdateGate>
    </AppProvider>
  );
}
