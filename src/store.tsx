import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
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
import { fmtDate, fmtTime, serverNow, monthName, computeTotalHours } from "./lib/date";

const SESSION_KEY = "primer_portal_session"; // DataStore analogue
const THEME_KEY = "primer_portal_theme";

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
  signIn: (email: string, remember: boolean) => void;
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
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionMeta | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionMeta) : null;
    } catch {
      return null;
    }
  });

  const [dark, setDark] = useState<boolean>(() => {
    return localStorage.getItem(THEME_KEY) === "dark";
  });

  const [screen, setScreen] = useState<ScreenId>("dashboard");
  const [stack, setStack] = useState<ScreenId[]>([]);

  const [profile, setProfile] = useState<Profile>(seedProfile);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(seedAttendance);
  const [leaves, setLeaves] = useState<LeaveRequest[]>(seedLeaves);
  const [ot, setOt] = useState<OtRequest[]>(seedOt);
  const [coverage, setCoverage] = useState<CoverageRequest[]>(seedCoverage);
  const [infractions] = useState<Infraction[]>(seedInfractions);
  const [holidays] = useState<Holiday[]>(seedHolidays);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const t: Toast = { id: newId(), text, kind };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3200);
  }, []);

  const signIn = useCallback((email: string, remember: boolean) => {
    const meta: SessionMeta = {
      employeeId: seedProfile.employeeId,
      email,
      rememberMe: remember,
      deviceBound: true,
      loggedInAt: Date.now(),
    };
    setSession(meta);
    if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    setScreen("dashboard");
    setStack([]);
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setScreen("dashboard");
    setStack([]);
  }, []);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  }, []);

  const navigate = useCallback(
    (s: ScreenId) => {
      setStack((prev) => [...prev, screen]);
      setScreen(s);
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
    setProfile((p) => ({ ...p, isClockedIn: true }));
    toast("Clocked in. Reminders scheduled for your shift.", "success");
  }, [profile.employeeId, toast]);

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
      return copy;
    });
    setProfile((p) => ({ ...p, isClockedIn: false }));
    toast("Clocked out. Total hours saved.", "success");
  }, [toast]);

  const updateNote = useCallback(
    (id: string, note: string) => {
      setAttendance((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, note, noteLastEditedTs: serverNow().getTime() }
            : r,
        ),
      );
      toast("Note saved.", "success");
    },
    [toast],
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
      // Credit deduction
      setProfile((p) => {
        if (lr.leaveType === "Vacation Leave")
          return { ...p, vlCredits: Math.max(0, p.vlCredits - lr.days) };
        if (lr.leaveType === "Sick Leave")
          return { ...p, slCredits: Math.max(0, p.slCredits - lr.days) };
        if (lr.leaveType === "Birthday Leave")
          return { ...p, blCredit: Math.max(0, p.blCredit - 1) };
        return p;
      });
      toast(`${lr.leaveType} request submitted.`, "success");
    },
    [toast],
  );

  const cancelLeave = useCallback(
    (id: string, reason: string) => {
      setLeaves((prev) => {
        const target = prev.find((l) => l.id === id);
        if (target) {
          // Return credits
          setProfile((p) => {
            if (target.leaveType === "Vacation Leave")
              return { ...p, vlCredits: p.vlCredits + target.days };
            if (target.leaveType === "Sick Leave")
              return { ...p, slCredits: p.slCredits + target.days };
            if (target.leaveType === "Birthday Leave")
              return { ...p, blCredit: p.blCredit + 1 };
            return p;
          });
        }
        return prev.map((l) =>
          l.id === id
            ? { ...l, status: "Cancelled" as const, cancellationReason: reason }
            : l,
        );
      });
      // Remove related coverage/attendance placeholders
      setCoverage((prev) =>
        prev.filter((c) => !(c.coverageType === "Leave" && c.requesterId === profile.employeeId && c.coverageStatus === "Available")),
      );
      toast("Leave cancelled and credits returned.", "success");
    },
    [profile.employeeId, toast],
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
      toast("OT request submitted.", "success");
    },
    [toast],
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
      toast("OT request cancelled.", "success");
    },
    [toast],
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
      toast("Tech issue coverage request submitted.", "success");
    },
    [toast],
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
      toast("Coverage taken over. Status set to Ongoing.", "success");
    },
    [profile.employeeId, profile.fullName, toast],
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
      toast("Coverage cancelled and returned to Available.", "info");
    },
    [toast],
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
      } else {
        setOt((prev) =>
          prev.map((o) =>
            o.id === id
              ? { ...o, status: "Change Pending" as const, otDate: newDate }
              : o,
          ),
        );
      }
      toast("Change request submitted (Change Pending).", "success");
    },
    [toast],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      setProfile((p) => ({ ...p, ...patch }));
      toast("Profile updated.", "success");
    },
    [toast],
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n)),
    );
  }, []);

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
    }),
    [
      session, signIn, signOut, dark, toggleDark, screen, navigate, back, stack.length,
      profile, attendance, leaves, ot, coverage, infractions, holidays, notifications,
      clockIn, clockOut, updateNote, submitLeave, cancelLeave, submitOt, cancelOt,
      submitTechCoverage, takeoverCoverage, cancelCoverage, changeLeaveDate, updateProfile,
      markNotificationRead, toasts, toast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
