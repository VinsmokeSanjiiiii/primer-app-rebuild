import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type {
  Profile,
  AttendanceRecord,
  LeaveRequest,
  OtRequest,
  CoverageRequest,
  Infraction,
  Holiday,
  AppNotification,
  ScreenId,
} from "./types";
import {
  seedProfile,
  seedAttendance,
  seedLeaves,
  seedOt,
  seedCoverage,
  seedInfractions,
  seedHolidays,
  seedNotifications,
  newId,
} from "./data/seed";
import { getRepository } from "./data/repository";
import {
  fmtDate,
  fmtTime,
  serverNow,
  monthName,
  computeTotalHours,
  setServerTimeOffsetMs,
} from "./lib/date";

// ---------------------------------------------------------------------------
// Keys for local persistence (DataStore analogue)
// ---------------------------------------------------------------------------
const SESSION_KEY = "primer_portal_session";
const THEME_KEY = "primer_portal_theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Toast {
  id: string;
  text: string;
  kind: "success" | "error" | "info";
}

interface SessionMeta {
  employeeId: string;
  email: string;
  rememberMe: boolean;
  deviceBound: boolean;
  loggedInAt: number;
}

interface AppState {
  // auth + session
  isAuthed: boolean;
  session: SessionMeta | null;
  signIn: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;

  // theme
  dark: boolean;
  toggleDark: () => void;

  // navigation
  screen: ScreenId;
  navigate: (s: ScreenId) => void;
  back: () => void;
  canGoBack: boolean;

  // data
  profile: Profile;
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  ot: OtRequest[];
  coverage: CoverageRequest[];
  infractions: Infraction[];
  holidays: Holiday[];
  notifications: AppNotification[];

  // mutations
  clockIn: () => void;
  clockOut: () => void;
  updateNote: (id: string, note: string) => void;
  submitLeave: (lr: Omit<LeaveRequest, "id" | "requestId" | "createdAt">) => void;
  cancelLeave: (id: string, reason: string) => void;
  submitOt: (o: Omit<OtRequest, "id" | "requestId" | "createdAt">) => void;
  cancelOt: (id: string, reason: string) => void;
  submitTechCoverage: (c: Omit<CoverageRequest, "id" | "coverageId" | "createdAt">) => void;
  takeoverCoverage: (id: string) => void;
  cancelCoverage: (id: string) => void;
  changeLeaveDate: (kind: "leave" | "ot", id: string, newDate: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  markNotificationRead: (id: string) => void;

  // toasts
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;

  // internal
  hasHydrated: boolean;
}

const Ctx = createContext<AppState | null>(null);

// ---------------------------------------------------------------------------
// The four bottom-nav root screens — navigating between these replaces
// the view instead of stacking, preventing infinite stack growth.
// ---------------------------------------------------------------------------
const ROOT_SCREENS: ReadonlySet<ScreenId> = new Set([
  "dashboard",
  "attendance",
  "requests",
  "profile",
]);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => getRepository(), []);

  // ---- session ----
  const [session, setSession] = useState<SessionMeta | null>(() => {
    try {
      const raw =
        localStorage.getItem(SESSION_KEY) ??
        sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionMeta) : null;
    } catch {
      return null;
    }
  });

  // ---- theme ----
  const [dark, setDark] = useState<boolean>(() => {
    return localStorage.getItem(THEME_KEY) === "dark";
  });

  // ---- navigation ----
  const [screen, setScreen] = useState<ScreenId>("dashboard");
  const [stack, setStack] = useState<ScreenId[]>([]);

  // ---- data ----
  const [profile, setProfile] = useState<Profile>(seedProfile);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(seedAttendance);
  const [leaves, setLeaves] = useState<LeaveRequest[]>(seedLeaves);
  const [ot, setOt] = useState<OtRequest[]>(seedOt);
  const [coverage, setCoverage] = useState<CoverageRequest[]>(seedCoverage);
  const [infractions] = useState<Infraction[]>(seedInfractions);
  const [holidays] = useState<Holiday[]>(seedHolidays);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications);

  // ---- toasts ----
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const t: Toast = { id: newId(), text, kind };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3200);
  }, []);

  // ---- persist mutations to repository in the background ----
  // (fire-and-forget so the UI stays fast; errors toast)
  const persistProfile = useCallback(
    (p: Profile) => {
      repo.updateProfile(p.employeeId, p).catch(() => {});
    },
    [repo],
  );

  // ---- auth ----
  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      // Legacy login flow: look up the user by `Primer_Email` in the
      // `/Users` node and compare the entered password against the
      // `Password` field.  The repository returns the matching
      // Employee_ID_Number so we can hydrate the correct profile.
      const result = await repo.signIn(email, password);
      if (!result.success || !result.employeeId) {
        return { success: false, error: result.error };
      }

      const meta: SessionMeta = {
        employeeId: result.employeeId,
        email,
        rememberMe: remember,
        deviceBound: true,
        loggedInAt: Date.now(),
      };
      setSession(meta);
      if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(meta));

      // Hydrate the profile from the Users node before showing the
      // dashboard so the screen renders the real account immediately.
      try {
        const p = await repo.getProfile(result.employeeId);
        if (p) setProfile(p);
      } catch {
        /* keep seed fallback */
      }

      setScreen("dashboard");
      setStack([]);
      return { success: true };
    },
    [repo],
  );

  const signOut = useCallback(() => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setScreen("dashboard");
    setStack([]);
    repo.signOut().catch(() => {});
  }, [repo]);

  // ---- theme ----
  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  }, []);

  // ---- navigation ----
  const navigate = useCallback(
    (s: ScreenId) => {
      if (s === screen) return; // already here
      // If navigating to a root tab, clear the stack and switch directly.
      if (ROOT_SCREENS.has(s)) {
        setStack([]);
        setScreen(s);
      } else {
        setStack((prev) => [...prev, screen]);
        setScreen(s);
      }
    },
    [screen],
  );

  const back = useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) {
        setScreen("dashboard");
        return prev;
      }
      const next = [...prev];
      const last = next.pop()!;
      setScreen(last);
      return next;
    });
  }, []);

  // ---- hydrate data from repository on mount (once) ----
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    if (hasHydrated) return;
    (async () => {
      try {
        // First, cache the Firebase server-time offset so that
        // `serverNow()` is accurate for clock-in/out, note locks, and
        // any other server-anchored timestamp logic.
        const offset = await repo.getServerTimeOffsetMs();
        if (typeof offset === "number") setServerTimeOffsetMs(offset);

        // Use the signed-in employee id when available, falling back
        // to the seed profile's id for the first paint.
        const sessionEmp = (await repo.getSession())?.employeeId;
        const empId = sessionEmp ?? seedProfile.employeeId;

        const [p, a, l, o, c, notifs] = await Promise.all([
          repo.getProfile(empId),
          repo.getAttendance(empId),
          repo.getLeaves(empId),
          repo.getOtRequests(empId),
          repo.getCoverage(),
          repo.getNotifications(empId),
        ]);
        if (p) setProfile(p);
        if (a.length) setAttendance(a);
        if (l.length) setLeaves(l);
        if (o.length) setOt(o);
        if (c.length) setCoverage(c);
        if (notifs.length) setNotifications(notifs);
        setHasHydrated(true);
      } catch {
        // Falls back to seed data — no crash.
        setHasHydrated(true);
      }
    })();
  }, [repo, hasHydrated]);

  // ---- mutations ----
  const clockIn = useCallback(() => {
    const now = serverNow();
    const rec: AttendanceRecord = {
      id: newId(),
      attendanceCode: `ATT-${Math.floor(Math.random() * 9000 + 1000)}`,
      employeeId: profile.employeeId,
      dateIn: fmtDate(now),
      timeIn: fmtTime(now),
      note: "",
      noteLocked: false,
      minsLate: 0,
      recordType: "Regular",
      status: "Open",
      isClockedIn: true,
      month: monthName(now),
      year: now.getFullYear(),
    };
    setAttendance((prev) => [rec, ...prev]);
    setProfile((p) => {
      const next = { ...p, isClockedIn: true };
      persistProfile(next);
      return next;
    });
    repo.createAttendance(rec).catch(() => {});
    toast("Clocked in. Reminders scheduled for your shift.", "success");
  }, [profile.employeeId, toast, repo, persistProfile]);

  const clockOut = useCallback(() => {
    const now = serverNow();
    setAttendance((prev) => {
      const idx = prev.findIndex((r) => r.isClockedIn);
      if (idx === -1) return prev;
      const r = prev[idx];
      const dateOut = fmtDate(now);
      const timeOut = fmtTime(now);
      const total = computeTotalHours(r.dateIn, r.timeIn, dateOut, timeOut);
      const updated: AttendanceRecord = {
        ...r,
        dateOut,
        timeOut,
        totalHours: total,
        isClockedIn: false,
        status: "Complete",
        clockOutTs: now.getTime(),
      };
      const copy = [...prev];
      copy[idx] = updated;
      repo.updateAttendance(updated.id, updated).catch(() => {});
      return copy;
    });
    setProfile((p) => {
      const next = { ...p, isClockedIn: false };
      persistProfile(next);
      return next;
    });
    toast("Clocked out. Total hours saved.", "success");
  }, [toast, repo, persistProfile]);

  const updateNote = useCallback(
    (id: string, note: string) => {
      const ts = serverNow().getTime();
      setAttendance((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, note, noteLastEditedTs: ts } : r,
        ),
      );
      repo.updateAttendance(id, { note, noteLastEditedTs: ts }).catch(() => {});
      toast("Note saved.", "success");
    },
    [toast, repo],
  );

  const submitLeave = useCallback<AppState["submitLeave"]>(
    (lr) => {
      const full: LeaveRequest = {
        ...lr,
        id: newId(),
        requestId: `LR-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setLeaves((prev) => [full, ...prev]);
      repo.createLeave(full).catch(() => {});
      // Credit deduction
      setProfile((p) => {
        let next = p;
        if (lr.leaveType === "Vacation Leave")
          next = { ...p, vlCredits: Math.max(0, p.vlCredits - lr.days) };
        else if (lr.leaveType === "Sick Leave")
          next = { ...p, slCredits: Math.max(0, p.slCredits - lr.days) };
        else if (lr.leaveType === "Birthday Leave")
          next = { ...p, blCredit: Math.max(0, p.blCredit - 1) };
        persistProfile(next);
        return next;
      });
      toast(`${lr.leaveType} request submitted.`, "success");
    },
    [toast, repo, persistProfile],
  );

  const cancelLeave = useCallback(
    (id: string, reason: string) => {
      setLeaves((prev) => {
        const target = prev.find((l) => l.id === id);
        if (target) {
          setProfile((p) => {
            let next = p;
            if (target.leaveType === "Vacation Leave")
              next = { ...p, vlCredits: p.vlCredits + target.days };
            else if (target.leaveType === "Sick Leave")
              next = { ...p, slCredits: p.slCredits + target.days };
            else if (target.leaveType === "Birthday Leave")
              next = { ...p, blCredit: p.blCredit + 1 };
            persistProfile(next);
            return next;
          });
        }
        return prev.map((l) =>
          l.id === id
            ? { ...l, status: "Cancelled" as const, cancellationReason: reason }
            : l,
        );
      });
      repo.updateLeave(id, { status: "Cancelled", cancellationReason: reason }).catch(() => {});
      repo
        .deleteCoverageByFilter({
          coverageType: "Leave",
          requesterId: profile.employeeId,
          coverageStatus: "Available",
        })
        .catch(() => {});
      setCoverage((prev) =>
        prev.filter(
          (c) =>
            !(
              c.coverageType === "Leave" &&
              c.requesterId === profile.employeeId &&
              c.coverageStatus === "Available"
            ),
        ),
      );
      toast("Leave cancelled and credits returned.", "success");
    },
    [profile.employeeId, toast, repo, persistProfile],
  );

  const submitOt = useCallback<AppState["submitOt"]>(
    (o) => {
      const full: OtRequest = {
        ...o,
        id: newId(),
        requestId: `OT-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setOt((prev) => [full, ...prev]);
      repo.createOtRequest(full).catch(() => {});
      toast("OT request submitted.", "success");
    },
    [toast, repo],
  );

  const cancelOt = useCallback(
    (id: string, reason: string) => {
      setOt((prev) =>
        prev.map((o) =>
          o.id === id
            ? { ...o, status: "Cancelled" as const, cancellationReason: reason }
            : o,
        ),
      );
      repo.updateOtRequest(id, { status: "Cancelled", cancellationReason: reason }).catch(() => {});
      toast("OT request cancelled.", "success");
    },
    [toast, repo],
  );

  const submitTechCoverage = useCallback<AppState["submitTechCoverage"]>(
    (c) => {
      const full: CoverageRequest = {
        ...c,
        id: newId(),
        coverageId: `CV-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setCoverage((prev) => [full, ...prev]);
      repo.createCoverage(full).catch(() => {});
      toast("Tech issue coverage request submitted.", "success");
    },
    [toast, repo],
  );

  const takeoverCoverage = useCallback(
    (id: string) => {
      setCoverage((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          if (c.requesterId === profile.employeeId) return c;
          return {
            ...c,
            coverageStatus: "Ongoing" as const,
            coveredById: profile.employeeId,
            takenBy: profile.fullName,
            coveredHours: c.forCoverageHours,
          };
        }),
      );
      repo
        .updateCoverage(id, {
          coverageStatus: "Ongoing",
          coveredById: profile.employeeId,
          takenBy: profile.fullName,
        })
        .catch(() => {});
      toast("Coverage taken over. Status set to Ongoing.", "success");
    },
    [profile.employeeId, profile.fullName, toast, repo],
  );

  const cancelCoverage = useCallback(
    (id: string) => {
      setCoverage((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                coverageStatus: "Available" as const,
                coveredById: undefined,
                takenBy: undefined,
                coveredHours: undefined,
              }
            : c,
        ),
      );
      repo
        .updateCoverage(id, {
          coverageStatus: "Available",
          coveredById: undefined,
          takenBy: undefined,
          coveredHours: undefined,
        })
        .catch(() => {});
      toast("Coverage cancelled and returned to Available.", "info");
    },
    [toast, repo],
  );

  const changeLeaveDate = useCallback(
    (kind: "leave" | "ot", id: string, newDate: string) => {
      if (kind === "leave") {
        setLeaves((prev) =>
          prev.map((l) =>
            l.id === id
              ? { ...l, status: "Change Pending" as const, leaveDate: [newDate] }
              : l,
          ),
        );
        repo.updateLeave(id, { status: "Change Pending", leaveDate: [newDate] }).catch(() => {});
      } else {
        setOt((prev) =>
          prev.map((o) =>
            o.id === id
              ? { ...o, status: "Change Pending" as const, otDate: newDate }
              : o,
          ),
        );
        repo.updateOtRequest(id, { status: "Change Pending", otDate: newDate }).catch(() => {});
      }
      toast("Change request submitted (Change Pending).", "success");
    },
    [toast, repo],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      setProfile((p) => {
        const next = { ...p, ...patch };
        persistProfile(next);
        return next;
      });
      toast("Profile updated.", "success");
    },
    [toast, persistProfile],
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      const readAt = Date.now();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt } : n)),
      );
      repo.updateNotification(id, { readAt }).catch(() => {});
    },
    [repo],
  );

  // ---- context value ----
  const value = useMemo<AppState>(
    () => ({
      isAuthed: !!session,
      session,
      signIn,
      signOut,
      dark,
      toggleDark,
      screen,
      navigate,
      back,
      canGoBack: stack.length > 0,
      profile,
      attendance,
      leaves,
      ot,
      coverage,
      infractions,
      holidays,
      notifications,
      clockIn,
      clockOut,
      updateNote,
      submitLeave,
      cancelLeave,
      submitOt,
      cancelOt,
      submitTechCoverage,
      takeoverCoverage,
      cancelCoverage,
      changeLeaveDate,
      updateProfile,
      markNotificationRead,
      toasts,
      toast,
      hasHydrated,
    }),
    [
      session, signIn, signOut, dark, toggleDark, screen, navigate, back, stack.length,
      profile, attendance, leaves, ot, coverage, infractions, holidays, notifications,
      clockIn, clockOut, updateNote, submitLeave, cancelLeave, submitOt, cancelOt,
      submitTechCoverage, takeoverCoverage, cancelCoverage, changeLeaveDate, updateProfile,
      markNotificationRead, toasts, toast, hasHydrated,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
