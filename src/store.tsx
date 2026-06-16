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
import { getRepository } from "./data/repository";
import {
  fmtDate,
  fmtTime,
  serverNow,
  monthName,
  phtYear,
  computeTotalHours,
  setServerTimeOffsetMs,
} from "./lib/date";

// ---------------------------------------------------------------------------
// Keys for local persistence (DataStore analogue)
// ---------------------------------------------------------------------------
const SESSION_KEY = "primer_portal_session";
const THEME_KEY = "primer_portal_theme";
// Persists the active (open) clock-in record so the session survives a tab
// close / page reload even when the Firebase write is slow or temporarily
// unavailable.  Cleared atomically when the user clocks out.
const ACTIVE_SESSION_KEY = "primer_active_session";

function saveActiveSession(rec: AttendanceRecord): void {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
}
function clearActiveSession(): void {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* ignore */ }
}
function loadActiveSession(): AttendanceRecord | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as AttendanceRecord;
    return rec?.isClockedIn ? rec : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Default empty profile for unauthenticated state
// ---------------------------------------------------------------------------
const EMPTY_PROFILE: Profile = {
  id: "",
  employeeId: "",
  primerEmail: "",
  fullName: "",
  passwordlessAuthEnabled: false,
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
  notes: "",
  philhealth: "",
  sss: "",
  tin: "",
  pagIbig: "",
  workSetup: "",
  isClockedIn: false,
  isFlextime: false,
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

interface SignInResult {
  success: boolean;
  error?: string;
  employeeId?: string;
  fullName?: string;
}

interface AppState {
  // auth + session
  isAuthed: boolean;
  session: SessionMeta | null;
  signIn: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<SignInResult>;
  signInWithEmployeeId: (
    employeeId: string,
    remember: boolean,
  ) => Promise<SignInResult>;
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
  // Start with empty data - will be hydrated from database
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [ot, setOt] = useState<OtRequest[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequest[]>([]);
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

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

  // ---- full hydration helper ----
  // Loads every per-user collection in parallel and applies them
  // atomically so the dashboard only renders once the data is real.
  const hydrateAll = useCallback(
    async (empId: string) => {
      const [p, a, l, o, c, i, h, notifs] = await Promise.all([
        repo.getProfile(empId).catch(() => null),
        repo.getAttendance(empId).catch(() => []),
        repo.getLeaves(empId).catch(() => []),
        repo.getOtRequests(empId).catch(() => []),
        repo.getCoverage().catch(() => []),
        repo.getInfractions(empId).catch(() => []),
        repo.getHolidays().catch(() => []),
        repo.getNotifications(empId).catch(() => []),
      ]);
      if (p) setProfile(p);

      // Belt-and-suspenders: if Firebase has no open attendance record but
      // localStorage has one (e.g. the Firebase write was temporarily
      // unavailable when the user clocked in), restore it into React state and
      // attempt a background sync to Firebase.
      const hasOpenRecord = a.some((r) => r.isClockedIn);
      if (!hasOpenRecord) {
        const saved = loadActiveSession();
        if (saved && saved.employeeId === empId) {
          setAttendance([saved, ...a]);
          // Re-attempt the Firebase write in the background.
          repo.createAttendance(saved).catch(() => {});
        } else {
          setAttendance(a);
        }
      } else {
        // Firebase has the real record — local backup no longer needed.
        clearActiveSession();
        setAttendance(a);
      }

      setLeaves(l);
      setOt(o);
      setCoverage(c);
      setInfractions(i);
      setHolidays(h);
      setNotifications(notifs);
      return p;
    },
    [repo],
  );

  // ---- auth ----
  const finalizeSignIn = useCallback(
    async (
      employeeId: string,
      email: string,
      remember: boolean,
    ): Promise<SignInResult> => {
      const meta: SessionMeta = {
        employeeId,
        email,
        rememberMe: remember,
        deviceBound: true,
        loggedInAt: Date.now(),
      };
      setSession(meta);
      if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(meta));
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(meta));

      // Hydrate everything before the dashboard mounts so no screen
      // ever shows stale or seed data after a successful login.
      const p = await hydrateAll(employeeId);

      setScreen("dashboard");
      setStack([]);
      return { success: true, employeeId, fullName: p?.fullName };
    },
    [hydrateAll],
  );

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      remember: boolean,
    ): Promise<SignInResult> => {
      const result = await repo.signIn(email, password);
      if (!result.success || !result.employeeId) {
        return { success: false, error: result.error };
      }
      return finalizeSignIn(result.employeeId, email, remember);
    },
    [repo, finalizeSignIn],
  );

  const signInWithEmployeeId = useCallback(
    async (employeeId: string, remember: boolean): Promise<SignInResult> => {
      // Used by the biometric unlock flow: the WebAuthn ceremony has
      // already proven the user is the device owner, so we trust the
      // stored employeeId and refresh the session.
      try {
        const p = await repo.getProfile(employeeId);
        if (!p) {
          return { success: false, error: "Account no longer exists." };
        }
        return finalizeSignIn(employeeId, p.primerEmail, remember);
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "Sign in failed.",
        };
      }
    },
    [repo, finalizeSignIn],
  );

  const signOut = useCallback(() => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    clearActiveSession(); // also clear any open clock-in session
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

        // Check if there's a session from a previous login
        const sessionEmp = (await repo.getSession())?.employeeId;
        if (sessionEmp) {
          // Hydrate all data for the logged-in user
          await hydrateAll(sessionEmp);
        }
        // If no session, keep empty state - user needs to log in
        setHasHydrated(true);
      } catch {
        // If hydration fails, still mark as hydrated but keep empty state
        setHasHydrated(true);
      }
    })();
  }, [repo, hasHydrated, hydrateAll]);

  // ---- mutations ----
  const clockIn = useCallback(() => {
    if (!profile) {
      toast("Please sign in first.", "error");
      return;
    }
    const now = serverNow();
    const nowMs = now.getTime();
    // Guard against duplicate open attendance records.
    // `alreadyOpen` and `newRecord` are closure variables — safe to read after
    // `setAttendance` because the functional updater runs synchronously.
    let alreadyOpen = false;
    let newRecord: AttendanceRecord | null = null;

    setAttendance((prev) => {
      alreadyOpen = prev.some((r) => r.isClockedIn);
      if (alreadyOpen) return prev;
      const rec: AttendanceRecord = {
        id: newId(),
        attendanceCode: `ATT-${Math.floor(Math.random() * 9000 + 1000)}`,
        employeeId: profile.employeeId,
        dateIn: fmtDate(now),
        timeIn: fmtTime(now),
        // clockInTs (unix ms) gives clock-out precise duration even after a
        // long idle session where the Device/string-format times would be stale.
        clockInTs: nowMs,
        note: "",
        noteLocked: false,
        minsLate: 0,
        recordType: profile.isFlextime ? "Flextime" : "Regular",
        status: "Open",
        isClockedIn: true,
        month: monthName(now),
        year: phtYear(now),
      };
      newRecord = rec;
      return [rec, ...prev];
    });

    if (alreadyOpen) {
      toast("You're already clocked in.", "info");
      return;
    }

    // Persist the session to localStorage FIRST so the active session card
    // survives a tab close / page reload regardless of the Firebase outcome.
    // hydrateAll will restore it and retry the write on next app open.
    if (newRecord) saveActiveSession(newRecord);

    // Write to Firebase outside the state updater to avoid the side-effect
    // being invoked twice in React Strict Mode / Concurrent Mode.
    setTimeout(() => {
      if (newRecord) {
        repo
          .createAttendance(newRecord)
          .then(() => {
            // Firebase confirmed — backup is now redundant but kept until
            // clock-out clears it, so offline reopens still show the session.
          })
          .catch(() => {
            // Firebase write failed but the record is already in React state
            // and localStorage.  The user can continue working; hydrateAll
            // will retry the write on the next app open.
            const offline = !navigator.onLine;
            toast(
              offline
                ? "You're offline — clock-in saved locally and will sync when you reconnect."
                : "Network error — clock-in saved locally. Check your connection.",
              "error",
            );
          });
        newRecord = null;
      }
    }, 0);

    setProfile((p) => {
      if (!p) return p;
      const next = { ...p, isClockedIn: true };
      persistProfile(next);
      return next;
    });
    toast("Clocked in successfully.", "success");
  }, [profile, toast, repo, persistProfile]);


  const clockOut = useCallback(() => {
    if (!profile) return;
    const now = serverNow();
    const nowMs = now.getTime();
    const dateOut = fmtDate(now);
    const timeOut = fmtTime(now);
    const empId = profile.employeeId;

    let updatedRecord: AttendanceRecord | null = null;

    setAttendance((prev) => {
      // If React state lost the open record (e.g. after a hot-reload or stale
      // state from a long idle session), recover it from localStorage before
      // computing the clock-out.  This is a read-only call so calling it twice
      // in Strict Mode is safe.
      let working = prev;
      if (!prev.some((r) => r.isClockedIn)) {
        const saved = loadActiveSession();
        if (saved && saved.employeeId === empId) {
          working = [saved, ...prev];
        }
      }

      const idx = working.findIndex((r) => r.isClockedIn);
      if (idx === -1) return prev; // genuinely nothing to close

      const r = working[idx];

      // Prefer unix-ms precision when clockInTs is stored; fall back to
      // string-parsing for legacy records that pre-date the field.
      const totalHours =
        r.clockInTs != null
          ? Math.max(0, Math.round(((nowMs - r.clockInTs) / 3.6e6) * 100) / 100)
          : computeTotalHours(r.dateIn, r.timeIn, dateOut, timeOut);

      const updated: AttendanceRecord = {
        ...r,
        dateOut,
        timeOut,
        totalHours,
        isClockedIn: false,
        status: "Complete",
        clockOutTs: nowMs,
      };
      updatedRecord = updated;
      const copy = [...working];
      copy[idx] = updated;
      return copy;
    });

    // Clear the local backup immediately — the session is now closed.
    clearActiveSession();

    // Firebase write outside the updater — safe from double-invocation in
    // Strict Mode because `updatedRecord` is nulled after the first call.
    setTimeout(() => {
      if (updatedRecord) {
        repo
          .updateAttendance(updatedRecord.id, updatedRecord)
          .catch(() => {
            const offline = !navigator.onLine;
            toast(
              offline
                ? "You're offline — clock-out will retry when you reconnect."
                : "Network error — clock-out may not have saved. Check your connection.",
              "error",
            );
          });
        updatedRecord = null;
      }
    }, 0);

    setProfile((p) => {
      if (!p) return p;
      const next = { ...p, isClockedIn: false };
      persistProfile(next);
      return next;
    });
    toast("Clocked out. Total hours saved.", "success");
  }, [profile, toast, repo, persistProfile]);

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
      // Vacation Leave: auto-approve, allow negative credits capped at -12
      // Sick Leave: always pending (no auto-approve)
      const autoApprove = lr.leaveType === "Vacation Leave";
      const status = autoApprove ? "Approved" : "Pending";

      const full: LeaveRequest = {
        ...lr,
        id: newId(),
        requestId: `LR-${Math.floor(Math.random() * 9000 + 1000)}`,
        createdAt: Date.now(),
        status,
      };
      setLeaves((prev) => [full, ...prev]);
      repo.createLeave(full).catch(() => {});

      // Credit handling
      setProfile((p) => {
        if (!p) return p;
        let next = { ...p };
        if (lr.leaveType === "Vacation Leave") {
          // Allow negative credits, cap at -12
          const newCredits = p.vlCredits - lr.days;
          next = { ...p, vlCredits: Math.max(-12, newCredits) };
        } else if (lr.leaveType === "Sick Leave") {
          // Sick leave can be used even at 0 credits
          next = { ...p, slCredits: Math.max(0, p.slCredits - lr.days) };
        } else if (lr.leaveType === "Birthday Leave") {
          next = { ...p, blCredit: Math.max(0, p.blCredit - 1) };
        }
        persistProfile(next);
        return next;
      });
      toast(`${lr.leaveType} request ${autoApprove ? "approved" : "submitted"}.`, "success");
    },
    [toast, repo, persistProfile],
  );

  const cancelLeave = useCallback(
    (id: string, reason: string) => {
      setLeaves((prev) => {
        const target = prev.find((l) => l.id === id);
        if (target && profile) {
          setProfile((p) => {
            if (!p) return p;
            let next = { ...p };
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
      if (profile) {
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
      }
      toast("Leave cancelled and credits returned.", "success");
    },
    [profile, toast, repo, persistProfile],
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
      if (!profile) return;
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
    [profile, toast, repo],
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
        if (!p) return p;
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
      isAuthed: !!session && !!profile,
      session,
      signIn,
      signInWithEmployeeId,
      signOut,
      dark,
      toggleDark,
      screen,
      navigate,
      back,
      canGoBack: stack.length > 0,
      profile: profile ?? EMPTY_PROFILE,
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
      session, signIn, signInWithEmployeeId, signOut, dark, toggleDark, screen, navigate, back, stack.length,
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
