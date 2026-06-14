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
import { newId } from "./data/seed";
import { getRepository, isOnlineRepository } from "./data/repository";
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
// Empty initial states - no seed data
// ---------------------------------------------------------------------------
const EMPTY_PROFILE: Profile = {
  id: "",
  employeeId: "",
  primerEmail: "",
  fullName: "",
  passwordlessAuthEnabled: false,
  deviceId: undefined,
  publicKey: undefined,
  role: "",
  position: "",
  team: "",
  schedule: "",
  daysOff: "",
  status: "",
  dateStarted: "",
  tenure: "",
  address: "",
  contactNumber: "",
  personalEmail: "",
  birthDate: "",
  department: "",
  phoneName: "",
  vlCredits: 0,
  slCredits: 0,
  blCredit: 0,
  slConversionCredits: 0,
  profileImageUrl: undefined,
  notes: "",
  philhealth: "",
  sss: "",
  tin: "",
  pagIbig: "",
  workSetup: "",
  isClockedIn: false,
};

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

  // loading state
  isLoading: boolean;

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

  // ---- data - start empty, never seed ----
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [ot, setOt] = useState<OtRequest[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequest[]>([]);
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // ---- toasts ----
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const t: Toast = { id: newId(), text, kind };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3200);
  }, []);

  // ---- persist mutations to repository in the background ----
  const persistProfile = useCallback(
    (p: Profile) => {
      if (!isOnlineRepository()) return;
      repo.updateProfile(p.employeeId, p).catch((err) => {
        console.error("Failed to persist profile:", err);
        toast("Failed to save changes. Please try again.", "error");
      });
    },
    [repo, toast],
  );

  // ---- hydrate user data from Firebase ----
  const hydrateUserData = useCallback(async (empId: string) => {
    setIsLoading(true);
    try {
      // First, cache the Firebase server-time offset
      const offset = await repo.getServerTimeOffsetMs();
      if (typeof offset === "number") setServerTimeOffsetMs(offset);

      const [p, a, l, o, c, inf, h, notifs] = await Promise.all([
        repo.getProfile(empId),
        repo.getAttendance(empId),
        repo.getLeaves(empId),
        repo.getOtRequests(empId),
        repo.getCoverage(),
        repo.getInfractions(empId),
        repo.getHolidays(),
        repo.getNotifications(empId),
      ]);

      if (p) setProfile(p);
      if (a.length) setAttendance(a);
      if (l.length) setLeaves(l);
      if (o.length) setOt(o);
      if (c.length) setCoverage(c);
      if (inf.length) setInfractions(inf);
      if (h.length) setHolidays(h);
      if (notifs.length) setNotifications(notifs);

      return true;
    } catch (err) {
      console.error("Hydration failed:", err);
      toast("Failed to load your data. Please try again.", "error");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [repo, toast]);

  // ---- auth ----
  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      setIsLoading(true);
      try {
        // Authenticate against Firebase
        const result = await repo.signIn(email, password);
        if (!result.success || !result.employeeId) {
          setIsLoading(false);
          return { success: false, error: result.error || "Sign in failed." };
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

        // Hydrate ALL user data BEFORE showing dashboard
        const hydrated = await hydrateUserData(result.employeeId);
        if (!hydrated) {
          // If hydration failed but auth succeeded, show a message but proceed
          toast("Signed in but some data may not have loaded.", "info");
        }

        setScreen("dashboard");
        setStack([]);
        return { success: true };
      } catch (err) {
        console.error("Sign in error:", err);
        const msg = err instanceof Error ? err.message : "Network error during sign in.";
        toast(msg, "error");
        return { success: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    [repo, hydrateUserData, toast],
  );

  const signOut = useCallback(() => {
    setSession(null);
    setProfile(EMPTY_PROFILE);
    setAttendance([]);
    setLeaves([]);
    setOt([]);
    setCoverage([]);
    setInfractions([]);
    setHolidays([]);
    setNotifications([]);
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
      if (s === screen) return;
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

  // ---- rehydrate on mount if session exists ----
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    if (hasHydrated || !session?.employeeId) return;
    (async () => {
      await hydrateUserData(session.employeeId);
      setHasHydrated(true);
    })();
  }, [session?.employeeId, hasHydrated, hydrateUserData, session]);

  // ---- mutations ----
  const clockIn = useCallback(() => {
    if (!profile.employeeId) {
      toast("Please sign in to clock in.", "error");
      return;
    }

    // Check for existing open attendance record
    const openRecord = attendance.find((r) => r.isClockedIn);
    if (openRecord) {
      toast("You already have an open clock-in record.", "error");
      return;
    }

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
    repo.createAttendance(rec).catch((err) => {
      console.error("Clock in failed:", err);
      toast("Clock in failed. Please try again.", "error");
    });
    toast("Clocked in successfully.", "success");
  }, [profile.employeeId, attendance, toast, repo, persistProfile]);

  const clockOut = useCallback(() => {
    if (!profile.employeeId) {
      toast("Please sign in to clock out.", "error");
      return;
    }

    const openRecord = attendance.find((r) => r.isClockedIn);
    if (!openRecord) {
      toast("No open clock-in record found.", "error");
      return;
    }

    const now = serverNow();
    const dateOut = fmtDate(now);
    const timeOut = fmtTime(now);
    const total = computeTotalHours(openRecord.dateIn, openRecord.timeIn, dateOut, timeOut);

    const updated: AttendanceRecord = {
      ...openRecord,
      dateOut,
      timeOut,
      totalHours: total,
      isClockedIn: false,
      status: "Complete",
      clockOutTs: now.getTime(),
    };

    setAttendance((prev) =>
      prev.map((r) => (r.id === openRecord.id ? updated : r))
    );
    setProfile((p) => {
      const next = { ...p, isClockedIn: false };
      persistProfile(next);
      return next;
    });
    repo.updateAttendance(updated.id, updated).catch((err) => {
      console.error("Clock out failed:", err);
      toast("Clock out failed. Please try again.", "error");
    });
    toast(`Clocked out. Total: ${total.toFixed(2)} hours.`, "success");
  }, [profile.employeeId, attendance, toast, repo, persistProfile]);

  const updateNote = useCallback(
    (id: string, note: string) => {
      const ts = serverNow().getTime();
      setAttendance((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, note, noteLastEditedTs: ts } : r,
        ),
      );
      repo.updateAttendance(id, { note, noteLastEditedTs: ts }).catch((err) => {
        console.error("Note update failed:", err);
        toast("Failed to save note.", "error");
      });
      toast("Note saved.", "success");
    },
    [toast, repo],
  );

  const submitLeave = useCallback<AppState["submitLeave"]>(
    (lr) => {
      if (!profile.employeeId) {
        toast("Please sign in to submit a leave request.", "error");
        return;
      }

      const full: LeaveRequest = {
        ...lr,
        id: newId(),
        requestId: `LR-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setLeaves((prev) => [full, ...prev]);
      repo.createLeave(full).catch((err) => {
        console.error("Leave creation failed:", err);
        toast("Failed to submit leave request.", "error");
      });

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
    [profile.employeeId, toast, repo, persistProfile],
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
      repo.updateLeave(id, { status: "Cancelled", cancellationReason: reason }).catch((err) => {
        console.error("Leave cancel failed:", err);
        toast("Failed to cancel leave.", "error");
      });
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
      if (!profile.employeeId) {
        toast("Please sign in to submit an OT request.", "error");
        return;
      }

      const full: OtRequest = {
        ...o,
        id: newId(),
        requestId: `OT-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setOt((prev) => [full, ...prev]);
      repo.createOtRequest(full).catch((err) => {
        console.error("OT creation failed:", err);
        toast("Failed to submit OT request.", "error");
      });
      toast("OT request submitted.", "success");
    },
    [profile.employeeId, toast, repo],
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
      repo.updateOtRequest(id, { status: "Cancelled", cancellationReason: reason }).catch((err) => {
        console.error("OT cancel failed:", err);
        toast("Failed to cancel OT request.", "error");
      });
      toast("OT request cancelled.", "success");
    },
    [toast, repo],
  );

  const submitTechCoverage = useCallback<AppState["submitTechCoverage"]>(
    (c) => {
      if (!profile.employeeId) {
        toast("Please sign in to submit a coverage request.", "error");
        return;
      }

      const full: CoverageRequest = {
        ...c,
        id: newId(),
        coverageId: `CV-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
      };
      setCoverage((prev) => [full, ...prev]);
      repo.createCoverage(full).catch((err) => {
        console.error("Coverage creation failed:", err);
        toast("Failed to submit coverage request.", "error");
      });
      toast("Tech issue coverage request submitted.", "success");
    },
    [profile.employeeId, toast, repo],
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
        .catch((err) => {
          console.error("Coverage takeover failed:", err);
          toast("Failed to take over coverage.", "error");
        });
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
        .catch((err) => {
          console.error("Coverage cancel failed:", err);
          toast("Failed to cancel coverage.", "error");
        });
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
        repo.updateLeave(id, { status: "Change Pending", leaveDate: [newDate] }).catch((err) => {
          console.error("Leave date change failed:", err);
          toast("Failed to change leave date.", "error");
        });
      } else {
        setOt((prev) =>
          prev.map((o) =>
            o.id === id
              ? { ...o, status: "Change Pending" as const, otDate: newDate }
              : o,
          ),
        );
        repo.updateOtRequest(id, { status: "Change Pending", otDate: newDate }).catch((err) => {
          console.error("OT date change failed:", err);
          toast("Failed to change OT date.", "error");
        });
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
      repo.updateNotification(id, { readAt }).catch((err) => {
        console.error("Notification update failed:", err);
        // Don't show toast for notification errors
      });
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
      isLoading,
      hasHydrated,
    }),
    [
      session, signIn, signOut, dark, toggleDark, screen, navigate, back, stack.length,
      profile, attendance, leaves, ot, coverage, infractions, holidays, notifications,
      clockIn, clockOut, updateNote, submitLeave, cancelLeave, submitOt, cancelOt,
      submitTechCoverage, takeoverCoverage, cancelCoverage, changeLeaveDate, updateProfile,
      markNotificationRead, toasts, toast, isLoading, hasHydrated,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
