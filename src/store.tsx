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
import { randomRecordId } from "./data/repository";
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

import {
  loadActiveSession,
  saveActiveSession,
  clearActiveSession as clearActiveSessionLS,
  purgeAllActiveSessions,
  markPending,
} from "./lib/activeSession";
import {
  reconcileActiveSession,
  persistAttendanceWithRetry,
} from "./lib/clockSync";
import { safeWrite } from "./lib/repoSafe";
import { cancelShiftReminders } from "./lib/reminders";
import {
  enqueueWrite,
  processWriteQueue,
  clearWriteQueue,
  type QueuedOpExecutor,
} from "./lib/writeQueue";
import { initConnectivity } from "./lib/connectivity";
import { auditSuccess, auditFailure } from "./lib/auditLog";
import { reportError, newCorrelationId } from "./lib/telemetry";
import { getDb } from "./data/firebase";

// ---------------------------------------------------------------------------
// Keys for local persistence (DataStore analogue)
// ---------------------------------------------------------------------------
const SESSION_KEY = "primer_portal_session";
const THEME_KEY = "primer_portal_theme";
const NAV_BLUR_KEY = "primer_portal_nav_blur";
const REDUCE_MOTION_KEY = "primer_portal_reduce_motion";
const CACHE_KEY = (empId: string) => `primer_portal_cache_${empId}`;

interface CachedSnapshot {
  v: 1;
  savedAt: number;
  profile: Profile | null;
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  ot: OtRequest[];
  coverage: CoverageRequest[];
  infractions: Infraction[];
  holidays: Holiday[];
  notifications: AppNotification[];
}

function loadSnapshot(empId: string): CachedSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(empId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshot;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function saveSnapshot(empId: string, snap: Omit<CachedSnapshot, "v" | "savedAt">): void {
  try {
    const full: CachedSnapshot = { v: 1, savedAt: Date.now(), ...snap };
    localStorage.setItem(CACHE_KEY(empId), JSON.stringify(full));
  } catch {
    /* quota / serialization errors are non-fatal */
  }
}

export type ThemeMode = "system" | "light" | "dark";

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readThemeMode(): ThemeMode {
  const raw = (typeof localStorage !== "undefined" && localStorage.getItem(THEME_KEY)) || "";
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
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
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  toggleDark: () => void;

  // appearance
  navBlur: boolean;
  setNavBlur: (v: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;

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
  coveredby: CoverageRequest[];
  infractions: Infraction[];
  holidays: Holiday[];
  notifications: AppNotification[];

  // mutations
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  clockBusy: boolean;
  updateNote: (id: string, note: string) => void;
  submitLeave: (lr: Omit<LeaveRequest, "id" | "requestId" | "createdAt">) => void;
  cancelLeave: (id: string, reason: string) => void;
  submitOt: (o: Omit<OtRequest, "id" | "requestId" | "createdAt">) => void;
  cancelOt: (id: string, reason: string) => void;
  submitTechCoverage: (c: Omit<CoverageRequest, "id" | "coverageId" | "createdAt">) => void;
  takeoverCoverage: (id: string) => void;
  cancelCoverage: (coveredbyId: string) => void;
  finishCoverage: (coveredbyId: string, coveredHoursSpent: number) => void;
  changeLeaveDate: (kind: "leave" | "ot", id: string, newDate: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  markNotificationRead: (id: string) => void;
  deleteNotification: (id: string) => void;

  // toasts
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;

  // manual refresh (for pull-to-refresh)
  refreshData: () => Promise<void>;

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

  // ---- theme (tri-state: system | light | dark) ----
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readThemeMode());
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());
  const dark = themeMode === "system" ? systemDark : themeMode === "dark";

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const setThemeMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(THEME_KEY, m);
    setThemeModeState(m);
  }, []);

  // ---- appearance: nav blur ----
  const [navBlur, setNavBlurState] = useState<boolean>(() => {
    const raw = localStorage.getItem(NAV_BLUR_KEY);
    return raw === null ? true : raw === "true";
  });
  const setNavBlur = useCallback((v: boolean) => {
    localStorage.setItem(NAV_BLUR_KEY, String(v));
    setNavBlurState(v);
  }, []);

  // ---- appearance: reduce motion ----
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(REDUCE_MOTION_KEY) : null;
    if (raw === null) {
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
      return false;
    }
    return raw === "true";
  });
  const setReduceMotion = useCallback((v: boolean) => {
    try { localStorage.setItem(REDUCE_MOTION_KEY, String(v)); } catch { /* ignore */ }
    setReduceMotionState(v);
  }, []);

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
  const [coveredby, setCoveredby] = useState<CoverageRequest[]>([]);
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
      void safeWrite("Profile sync", () => repo.updateProfile(p.employeeId, p), { retries: 2 });
    },
    [repo],
  );

  // ---- full hydration helper ----
  // Loads every per-user collection in parallel and applies them
  // atomically so the dashboard only renders once the data is real.
  const hydrateAll = useCallback(
    async (empId: string) => {
      const [p, a, l, o, c, cb, i, h, notifs] = await Promise.all([
        repo.getProfile(empId).catch(() => null),
        repo.getAttendance(empId).catch(() => []),
        repo.getLeaves(empId).catch(() => []),
        repo.getOtRequests(empId).catch(() => []),
        repo.getCoverage().catch(() => []),
        repo.getCoveredby().catch(() => []),
        repo.getInfractions(empId).catch(() => []),
        repo.getHolidays().catch(() => []),
        repo.getNotifications(empId).catch(() => []),
      ]);
      if (p) setProfile(p);

      // Reconcile local active-session backup with Firebase. This handles:
      //  - app killed before Firebase write finished
      //  - app killed after write succeeded but before UI saw it
      //  - clock-out write that never landed (retried in background)
      //  - cross-user contamination (per-employee keys)
      const reconciled = await reconcileActiveSession(repo, empId, a);
      setAttendance(reconciled.attendance);

      // Auto-create CoverageList entries for any approved leave that doesn't
      // already have a matching coverage record. This handles leaves approved
      // externally by an admin while the employee was offline.
      let coverageList = c;
      if (p) {
        const newCovs: CoverageRequest[] = [];
        for (const leave of l) {
          if (leave.status !== "Approved") continue;
          for (const leaveDate of leave.leaveDate) {
            const alreadyExists = coverageList.some(
              (cv) =>
                cv.requesterId === empId &&
                cv.coverageType === "Leave" &&
                cv.coverageDate === leaveDate,
            );
            if (!alreadyExists) {
              const _covId = randomRecordId();
              const cov: CoverageRequest = {
                id: _covId,
                coverageId: _covId,
                employeeId: empId,
                requesterId: empId,
                requesterName: p.fullName,
                phoneName: p.phoneName,
                coverageDate: leaveDate,
                coverageTime: p.schedule,
                coverageType: leave.leaveType,
                coverageStatus: "Available",
                forCoverageHours: 8,
                daysOff: p.daysOff,
                position: p.position,
                schedule: p.schedule,
                month: leave.month,
                year: leave.year,
                team: p.team,
                reason: `Coverage for ${leave.leaveType} on ${leaveDate}`,
                createdAt: Date.now(),
              };
              newCovs.push(cov);
              void safeWrite(
                "Coverage for approved leave",
                () => repo.createCoverage(cov),
                { retries: 2 },
              );
            }
          }
        }
        if (newCovs.length > 0) {
          coverageList = [...coverageList, ...newCovs];
        }
      }

      setLeaves(l);
      setOt(o);
      setCoverage(coverageList);
      setCoveredby(cb);
      setInfractions(i);
      setHolidays(h);
      setNotifications(notifs);

      // Persist a snapshot for instant-load on next app start.
      saveSnapshot(empId, {
        profile: p,
        attendance: reconciled.attendance,
        leaves: l,
        ot: o,
        coverage: coverageList,
        infractions: i,
        holidays: h,
        notifications: notifs,
      });
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

      // Fast path: if a cached snapshot exists (return login), paint the
      // dashboard immediately from cache and hydrate fresh data in background.
      const cached = loadSnapshot(employeeId);
      if (cached) {
        if (cached.profile) setProfile(cached.profile);
        setAttendance(cached.attendance ?? []);
        setLeaves(cached.leaves ?? []);
        setOt(cached.ot ?? []);
        setCoverage(cached.coverage ?? []);
        setInfractions(cached.infractions ?? []);
        setHolidays(cached.holidays ?? []);
        setNotifications(cached.notifications ?? []);
        setScreen("dashboard");
        setStack([]);
        void hydrateAll(employeeId); // refresh in background
        return { success: true, employeeId, fullName: cached.profile?.fullName };
      }

      // Slow path (first login — no cache): await full hydration before
      // navigating so the dashboard never shows an empty state.
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
    const empId = session?.employeeId;
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if (empId) {
      try { localStorage.removeItem(CACHE_KEY(empId)); } catch { /* ignore */ }
    }
    // Per-user backups stay until a successful sync; on explicit sign-out,
    // purge them — the user is deliberately ending their session.
    purgeAllActiveSessions();
    // Clear any queued writes — session is ending, writes can't be replayed.
    clearWriteQueue();
    void cancelShiftReminders();
    setScreen("dashboard");
    setStack([]);
    repo.signOut().catch(() => {});
  }, [repo, session?.employeeId]);

  // ---- theme: legacy toggle cycles system → light → dark → system ----
  const toggleDark = useCallback(() => {
    setThemeModeState((prev) => {
      const next: ThemeMode = prev === "system" ? "light" : prev === "light" ? "dark" : "system";
      localStorage.setItem(THEME_KEY, next);
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
    let cancelled = false;

    // Phase 1: instant paint from cached snapshot (synchronous, no network).
    // This lets the dashboard render the user's data immediately while the
    // live fetch happens in the background.
    try {
      const sessionEmp = session?.employeeId;
      if (sessionEmp) {
        const snap = loadSnapshot(sessionEmp);
        if (snap) {
          if (snap.profile) setProfile(snap.profile);
          setAttendance(snap.attendance ?? []);
          setLeaves(snap.leaves ?? []);
          setOt(snap.ot ?? []);
          setCoverage(snap.coverage ?? []);
          setInfractions(snap.infractions ?? []);
          setHolidays(snap.holidays ?? []);
          setNotifications(snap.notifications ?? []);
          setHasHydrated(true);
        }
      }
    } catch { /* non-fatal */ }

    // Phase 2: background live fetch — server-time and session resolved in
    // parallel so there's no unnecessary sequential round-trip.
    (async () => {
      try {
        const [offset, sessionData] = await Promise.all([
          repo.getServerTimeOffsetMs(),
          repo.getSession(),
        ]);
        if (!cancelled && typeof offset === "number") setServerTimeOffsetMs(offset);

        const sessionEmp = sessionData?.employeeId;
        if (sessionEmp && !cancelled) {
          await hydrateAll(sessionEmp);
        }
        if (!cancelled) setHasHydrated(true);
      } catch {
        if (!cancelled) setHasHydrated(true);
      }
    })();

    return () => { cancelled = true; };
  }, [repo, hasHydrated, hydrateAll, session?.employeeId]);

  // ---- refreshData: manual re-hydration for pull-to-refresh ----
  const refreshData = useCallback(async () => {
    if (!session?.employeeId) return;
    await hydrateAll(session.employeeId);
  }, [session?.employeeId, hydrateAll]);

  // ---- real-time data listeners ----
  // Subscribe to Firebase nodes via onValue so the UI reflects admin changes
  // instantly without a manual pull-to-refresh.
  useEffect(() => {
    if (!profile?.employeeId) return;
    const empId = profile.employeeId;
    const unsubLeaves = repo.subscribeLeaves(empId, setLeaves);
    const unsubOt = repo.subscribeOtRequests(empId, setOt);
    const unsubCoverage = repo.subscribeCoverage(setCoverage);
    const unsubCoveredby = repo.subscribeCoveredby(empId, setCoveredby);
    return () => {
      unsubLeaves();
      unsubOt();
      unsubCoverage();
      unsubCoveredby();
    };
  }, [profile?.employeeId, repo]);

  // Re-reconcile the active clock session whenever the user comes back to
  // the tab/app or the device comes back online. This catches the case
  // where a clock-in/out write failed silently while the app was hidden.
  useEffect(() => {
    if (!profile?.employeeId) return;
    const empId = profile.employeeId;
    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void (async () => {
        try {
          const fresh = await repo.getAttendance(empId);
          const reconciled = await reconcileActiveSession(repo, empId, fresh);
          setAttendance(reconciled.attendance);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[reconcile] background sync failed", err);
        }
      })();
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("online", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("online", run);
    };
  }, [profile?.employeeId, repo]);

  // ---- connectivity manager init (Feature 3) ----
  // Initialize once; safe to call multiple times (singleton guard inside).
  useEffect(() => {
    initConnectivity(getDb());
  }, []);

  // ---- durable write queue executor (Feature 1) ----
  // Maps opType strings back to repository calls for queue replay.
  const queueExecutor = useCallback<QueuedOpExecutor>(
    async (opType, payload) => {
      try {
        switch (opType) {
          case "createLeave":
            await repo.createLeave(payload as LeaveRequest);
            return { ok: true };
          case "updateLeave": {
            const { id, patch } = payload as { id: string; patch: Partial<LeaveRequest> };
            await repo.updateLeave(id, patch);
            return { ok: true };
          }
          case "createOtRequest":
            await repo.createOtRequest(payload as OtRequest);
            return { ok: true };
          case "updateOtRequest": {
            const { id, patch } = payload as { id: string; patch: Partial<OtRequest> };
            await repo.updateOtRequest(id, patch);
            return { ok: true };
          }
          case "createCoverage":
            await repo.createCoverage(payload as CoverageRequest);
            return { ok: true };
          case "createCoveredby":
            await repo.createCoveredby(payload as CoverageRequest);
            return { ok: true };
          case "updateCoverage": {
            const { id, patch } = payload as { id: string; patch: Partial<CoverageRequest> };
            await repo.updateCoverage(id, patch);
            return { ok: true };
          }
          case "updateCoveredby": {
            const { id, patch } = payload as { id: string; patch: Partial<CoverageRequest> };
            await repo.updateCoveredby(id, patch);
            return { ok: true };
          }
          case "deleteCoveredby":
            await repo.deleteCoveredby(payload as string);
            return { ok: true };
          case "updateProfile": {
            const { id, patch } = payload as { id: string; patch: Partial<Profile> };
            await repo.updateProfile(id, patch);
            return { ok: true };
          }
          default:
            return { ok: false, error: new Error(`Unknown opType: ${opType}`) };
        }
      } catch (err) {
        return { ok: false, error: err };
      }
    },
    [repo],
  );

  // ---- write queue processor: replay pending writes when online (Feature 1) ----
  useEffect(() => {
    const empId = session?.employeeId;
    const handleOnline = () => {
      void processWriteQueue(queueExecutor, (failed) => {
        toast(
          `A pending action (${failed.opType.replace(/([A-Z])/g, " $1").toLowerCase()}) could not be synced after ${failed.maxRetries} attempts. Please check your records.`,
          "error",
        );
        reportError(
          "Write queue permanent failure",
          "offline_queue_failure",
          new Error(failed.lastError ?? "unknown"),
          {
            employeeId: empId,
            correlationId: newCorrelationId(),
            context: { opType: failed.opType, dedupKey: failed.dedupKey },
          },
        );
      });
    };
    window.addEventListener("online", handleOnline);
    // Also process on mount (in case there are pending entries from a previous session).
    void handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, [queueExecutor, toast, session?.employeeId]);


  // ---- mutations ----
  // `clockBusy` blocks the Clock button while a write is in-flight; this
  // prevents double-taps and React Strict Mode double-invocation from
  // producing duplicate writes.
  const [clockBusy, setClockBusy] = useState(false);

  const clockIn = useCallback(async (): Promise<void> => {
    if (!profile) {
      toast("Please sign in first.", "error");
      return;
    }
    if (clockBusy) return;
    const empId = profile.employeeId;

    // Hard guard: any existing open record (in state or in the durable
    // backup) means the user is already clocked in.
    const stateOpen = attendance.some(
      (r) => r.isClockedIn && r.employeeId === empId,
    );
    const backup = loadActiveSession(empId);
    if (stateOpen || (backup && backup.isClockedIn)) {
      toast("You're already clocked in.", "info");
      return;
    }

    setClockBusy(true);

    // Atomic guard: prevent concurrent clock-in from another device (Feature 2).
    // If this transaction aborts (alreadyIn: true), either a second device is
    // genuinely clocked in, OR the isClockedIn flag is stale (e.g., a prior
    // clock-out's profile sync failed). We cross-check against actual open
    // Attendance records before blocking to avoid the stale-flag deadlock.
    const atomicClock = await repo.atomicClockIn(empId);
    if (!atomicClock.ok && !atomicClock.networkError && atomicClock.alreadyIn) {
      let hasActualOpenSession = false;
      try {
        const freshAtt = await repo.getAttendance(empId);
        hasActualOpenSession = freshAtt.some((r) => r.isClockedIn && r.employeeId === empId);
      } catch {
        // Can't verify from Firebase — be conservative; use the local state.
        hasActualOpenSession = attendance.some((r) => r.isClockedIn && r.employeeId === empId);
      }
      if (hasActualOpenSession) {
        setClockBusy(false);
        auditFailure(empId, "clock_in", "Attendance", "Atomic guard: open session confirmed on another device");
        toast("You're already clocked in on another device.", "info");
        return;
      }
      // Stale flag detected (isClockedIn=true but no open Attendance record).
      // Proceed with clock-in; the profile sync write will reset the flag correctly.
    }

    try {
      const now = serverNow();
      const nowMs = now.getTime();
      const _attId = randomRecordId();
      const rec: AttendanceRecord = {
        id: _attId,
        attendanceCode: _attId,
        employeeId: empId,
        dateIn: fmtDate(now),
        timeIn: fmtTime(now),
        clockInTs: nowMs,
        note: "",
        noteLocked: false,
        minsLate: (() => {
          if (profile.isFlextime) return 0;
          const scheduleParts = (profile.schedule ?? "").split("-");
          const startPart = scheduleParts[0]?.trim() ?? "";
          const [shH, shM] = startPart.split(":").map(Number);
          if (!Number.isNaN(shH) && !Number.isNaN(shM)) {
            const scheduledStart = shH * 60 + shM;
            const actualStart = now.getHours() * 60 + now.getMinutes();
            return Math.max(0, actualStart - scheduledStart);
          }
          return 0;
        })(),
        phoneName: profile.phoneName,
        team: profile.team,
        workSetup: profile.workSetup,
        recordType: profile.isFlextime ? "Flextime" : "Regular",
        status: "None",
        isClockedIn: true,
        month: monthName(now),
        year: phtYear(now),
        aBonus: 0,
        rHoliday: 0,
        sHoliday: 0,
        infraction: 0,
      };

      // Persist the durable backup BEFORE touching React state or Firebase.
      // If the app dies between here and the next line, hydration recovers it.
      saveActiveSession(markPending(rec, "create"));

      // Dedupe by id on insert — protects against a Strict Mode double-call.
      setAttendance((prev) => {
        if (prev.some((r) => r.id === rec.id)) return prev;
        return [rec, ...prev];
      });

      // Mirror profile flag (compat only; UI reads from attendance).
      setProfile((p) => {
        if (!p) return p;
        const next = { ...p, isClockedIn: true };
        void safeWrite("Profile sync", () => repo.updateProfile(empId, next));
        return next;
      });

      const ok = await persistAttendanceWithRetry(
        "Clock-in",
        "create",
        markPending(rec, "create"),
        repo,
        toast,
      );
      if (ok) {
        // Clear pendingOp but keep the backup until clock-out — guarantees
        // an offline reopen still sees the active session card.
        saveActiveSession(markPending(rec, null));
        auditSuccess(empId, "clock_in", "Attendance", {
          targetId: rec.id,
          after: { dateIn: rec.dateIn, timeIn: rec.timeIn, minsLate: rec.minsLate },
        });
        toast("Clocked in successfully.", "success");
      }
      // On failure, persistAttendanceWithRetry already toasted and left the
      // backup with pendingOp:"create" for reconciliation to retry.
    } finally {
      setClockBusy(false);
    }
  }, [profile, toast, repo, attendance, clockBusy]);

  const clockOut = useCallback(async (): Promise<void> => {
    if (!profile) return;
    if (clockBusy) return;
    const empId = profile.employeeId;

    // Find the open record from state or recover it from the backup.
    let openRec = attendance.find(
      (r) => r.isClockedIn && r.employeeId === empId,
    );
    if (!openRec) {
      const backup = loadActiveSession(empId);
      if (backup && backup.isClockedIn) openRec = backup;
    }
    if (!openRec) {
      toast("You're not currently clocked in.", "info");
      return;
    }

    setClockBusy(true);
    try {
      const now = serverNow();
      const nowMs = now.getTime();
      const dateOut = fmtDate(now);
      const timeOut = fmtTime(now);

      // Canonical: derive from stored clockInTs. Legacy string-parse fallback.
      const totalHours =
        openRec.clockInTs != null
          ? Math.max(0, Math.round(((nowMs - openRec.clockInTs) / 3.6e6) * 100) / 100)
          : computeTotalHours(openRec.dateIn, openRec.timeIn, dateOut, timeOut);

      const updated: AttendanceRecord = {
        ...openRec,
        dateOut,
        timeOut,
        totalHours,
        isClockedIn: false,
        status: "Complete",
        clockOutTs: nowMs,
      };

      // Update the backup to the closed record FIRST and mark pendingOp:"update".
      // We deliberately do NOT clear it here — only after a successful sync,
      // so a crash mid-finalization is recoverable.
      saveActiveSession(markPending(updated, "update"));

      setAttendance((prev) => {
        const idx = prev.findIndex((r) => r.id === updated.id);
        if (idx === -1) return [updated, ...prev];
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });

      setProfile((p) => {
        if (!p) return p;
        const next = { ...p, isClockedIn: false };
        void safeWrite("Profile sync", () => repo.updateProfile(empId, next));
        return next;
      });

      const ok = await persistAttendanceWithRetry(
        "Clock-out",
        "update",
        markPending(updated, "update"),
        repo,
        toast,
      );
      if (ok) {
        // Finalized — backup no longer needed.
        clearActiveSessionLS(empId);
        auditSuccess(empId, "clock_out", "Attendance", {
          targetId: updated.id,
          after: { dateOut, timeOut, totalHours: updated.totalHours },
        });
        toast("Clocked out. Total hours saved.", "success");
      }
      // On failure: backup remains with pendingOp:"update"; reconciliation
      // retries with the same id, so no duplicate record is created.
    } finally {
      setClockBusy(false);
    }
  }, [profile, toast, repo, attendance, clockBusy]);

  const updateNote = useCallback(
    (id: string, note: string) => {
      const ts = serverNow().getTime();
      setAttendance((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, note, noteLastEditedTs: ts } : r,
        ),
      );
      void safeWrite(
        "Note save",
        () => repo.updateAttendance(id, { note, noteLastEditedTs: ts }),
        { critical: true, retries: 2, toast },
      );
      toast("Note saved.", "success");
    },
    [toast, repo],
  );

  const submitLeave = useCallback<AppState["submitLeave"]>(
    (lr) => {
      // Vacation Leave: auto-approve, allow negative credits capped at -12
      // Sick Leave / Bereavement / Birthday: always pending
      const autoApprove = lr.leaveType === "Vacation Leave";
      const status = autoApprove ? "Approved" : "Pending";

      const _reqId = randomRecordId();
      const full: LeaveRequest = {
        ...lr,
        id: _reqId,
        requestId: _reqId,
        createdAt: Date.now(),
        status,
      };

      // Optimistic: add to local list first so the UI reflects the request
      setLeaves((prev) => [full, ...prev]);

      void (async () => {
        // Await the write — do NOT deduct credits until we know it landed
        const result = await safeWrite("Leave request", () => repo.createLeave(full), { critical: true, retries: 2, toast });

        if (!result.ok) {
          if (result.kind === "network") {
            // Network failure — keep the optimistic entry and queue for later sync (Feature 1).
            enqueueWrite({
              dedupKey: `createLeave_${full.requestId}`,
              opType: "createLeave",
              payload: full,
              maxRetries: 5,
            });
          } else {
            // Non-network failure — roll back the optimistic leave entry.
            setLeaves((prev) => prev.filter((l) => l.id !== full.id));
          }
          return;
        }
        // Audit successful submission (Feature 5).
        auditSuccess(profile?.employeeId ?? "", "leave_submitted", "LeaveRequest", {
          targetId: full.requestId,
          after: { leaveType: full.leaveType, status: full.status, days: full.days },
        });

        // Write succeeded — now deduct credits and persist the profile
        setProfile((p) => {
          if (!p) return p;
          let next = { ...p };
          if (lr.leaveType === "Vacation Leave") {
            const newCredits = p.vlCredits - lr.days;
            next = { ...p, vlCredits: Math.max(-12, newCredits) };
          } else if (lr.leaveType === "Sick Leave") {
            next = { ...p, slCredits: Math.max(0, p.slCredits - lr.days) };
          } else if (lr.leaveType === "Birthday Leave") {
            next = { ...p, blCredit: Math.max(0, p.blCredit - 1) };
          }
          persistProfile(next);
          return next;
        });

        // Auto-approved VL → create a coverage slot so a teammate can fill in
        if (autoApprove && profile) {
          for (const d of full.leaveDate) {
            const covId = randomRecordId();
            const cov: CoverageRequest = {
              id: covId,
              coverageId: covId,
              employeeId: profile.employeeId,
              requesterId: profile.employeeId,
              requesterName: profile.fullName,
              phoneName: profile.phoneName,
              coverageDate: d,
              coverageTime: profile.schedule,
              coverageType: lr.leaveType,
              coverageStatus: "Available",
              forCoverageHours: 8,
              daysOff: profile.daysOff,
              position: profile.position,
              schedule: profile.schedule,
              month: lr.month,
              year: lr.year,
              team: profile.team,
              reason: `Coverage for ${lr.leaveType} on ${d}`,
              createdAt: Date.now(),
            };
            setCoverage((prev) => [cov, ...prev]);
            void safeWrite("Coverage for leave", () => repo.createCoverage(cov), { retries: 2 });
          }
        }

        toast(`${lr.leaveType} request ${autoApprove ? "approved" : "submitted"}.`, "success");
      })();
    },
    [toast, repo, persistProfile, profile],
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
      void safeWrite("Cancel leave", () => repo.updateLeave(id, { status: "Cancelled", cancellationReason: reason }), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `cancelLeave_${id}`, opType: "updateLeave", payload: { id, patch: { status: "Cancelled", cancellationReason: reason } }, maxRetries: 5 });
        } else if (r.ok) {
          auditSuccess(profile?.employeeId ?? "", "leave_cancelled", "LeaveRequest", { targetId: id, after: { status: "Cancelled", reason } });
        }
      });
      if (profile) {
        void safeWrite("Coverage cleanup", () => repo.deleteCoverageByFilter({
            coverageType: "Leave",
            requesterId: profile.employeeId,
            coverageStatus: "Available",
          }), { retries: 2 });
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
      const _otId = randomRecordId();
      const full: OtRequest = {
        phoneName: profile?.phoneName,
        ...o,
        id: _otId,
        requestId: _otId,
        createdAt: Date.now(),
      };
      setOt((prev) => [full, ...prev]);
      void safeWrite("OT request", () => repo.createOtRequest(full), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `createOt_${full.requestId}`, opType: "createOtRequest", payload: full, maxRetries: 5 });
        } else if (r.ok) {
          auditSuccess(profile?.employeeId ?? "", "ot_submitted", "OTRequest", { targetId: full.requestId, after: { otDate: full.otDate, status: full.status } });
        }
      });
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
      void safeWrite("Cancel OT", () => repo.updateOtRequest(id, { status: "Cancelled", cancellationReason: reason }), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `cancelOt_${id}`, opType: "updateOtRequest", payload: { id, patch: { status: "Cancelled", cancellationReason: reason } }, maxRetries: 5 });
        }
      });
      toast("OT request cancelled.", "success");
    },
    [toast, repo],
  );

  const submitTechCoverage = useCallback<AppState["submitTechCoverage"]>(
    (c) => {
      const _covId = randomRecordId();
      const full: CoverageRequest = {
        ...c,
        id: _covId,
        coverageId: _covId,
        createdAt: Date.now(),
      };
      setCoverage((prev) => [full, ...prev]);
      void safeWrite("Coverage request", () => repo.createCoverage(full), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `createCov_${full.coverageId}`, opType: "createCoverage", payload: full, maxRetries: 5 });
        }
      });
      toast("Tech issue coverage request submitted.", "success");
    },
    [toast, repo],
  );

  const takeoverCoverage = useCallback(
    async (id: string) => {
      if (!profile) return;
      // Prevent duplicate: do not grab if already taken by this user in an active Ongoing coveredby record
      const alreadyTaken = coveredby.some(
        (c) =>
          c.originalCoverageId === id &&
          c.coveredById === profile.employeeId &&
          c.coverageStatus === "Ongoing",
      );
      if (alreadyTaken) {
        toast("You already have this coverage.", "info");
        return;
      }
      const original = coverage.find((c) => c.id === id);
      if (!original) return;

      // Create a brand-new Coveredby record with a new unique ID
      // using the grabber's profile data, NOT modifying the original CoverageList
      const newCovId = randomRecordId();
      const coveredbyRecord: CoverageRequest = {
        id: newCovId,
        coverageId: newCovId,
        employeeId: profile.employeeId,
        requesterId: profile.employeeId,
        requesterName: profile.fullName,
        phoneName: profile.phoneName,
        coverageDate: original.coverageDate,
        coverageTime: original.coverageTime,
        coverageType: original.coverageType,
        coverageStatus: "Ongoing" as const,
        forCoverageHours: original.forCoverageHours,
        coveredHours: 0,
        daysOff: profile.daysOff,
        position: profile.position,
        schedule: original.coverageTime,
        month: original.month,
        year: original.year,
        team: profile.team,
        reason: original.reason,
        coveredById: profile.employeeId,
        takenBy: profile.fullName,
        originalCoverageId: original.id,
        coverageStartTs: serverNow().getTime(),
        createdAt: Date.now(),
      };

      // Atomic guard: prevent the same employee from double-grabbing via race
      // condition (e.g. double-tap, two devices on the same account). (Feature 2)
      // Note: multiple DIFFERENT employees CAN each grab — that is by design.
      const claimResult = await repo.atomicClaimCoverage(id, profile.employeeId);
      if (!claimResult.ok && claimResult.alreadyTaken && !claimResult.networkError) {
        auditFailure(profile.employeeId, "coverage_grabbed", "Coverage", "Atomic guard: duplicate grab rejected", { targetId: id });
        toast("You already have this coverage (concurrent request detected).", "info");
        return;
      }
      // If networkError: fall through — the existing in-memory duplicate check
      // (coveredby state list) still guards against double-submission.

      // Add to local coveredby list; the CoverageList record stays "Available"
      setCoveredby((prev) => [coveredbyRecord, ...prev]);

      // Persist the new Coveredby record to Firebase
      void safeWrite("Coveredby create", () => repo.createCoveredby(coveredbyRecord), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `createCoveredby_${coveredbyRecord.id}`, opType: "createCoveredby", payload: coveredbyRecord, maxRetries: 5 });
        } else if (r.ok) {
          auditSuccess(profile.employeeId, "coverage_grabbed", "Coverage", {
            targetId: coveredbyRecord.id,
            after: { coverageDate: coveredbyRecord.coverageDate, originalCoverageId: id },
          });
        }
      });
      toast("Coverage grabbed! Status set to Ongoing.", "success");
    },
    [profile, toast, repo, coverage, coveredby],
  );

  const cancelCoverage = useCallback(
    (coveredbyId: string) => {
      // Remove the Coveredby record; the original CoverageList stays Available
      setCoveredby((prev) => prev.filter((c) => c.id !== coveredbyId));
      void safeWrite("Coveredby delete", () => repo.deleteCoveredby(coveredbyId), { critical: true, retries: 2, toast }).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `deleteCoveredby_${coveredbyId}`, opType: "deleteCoveredby", payload: coveredbyId, maxRetries: 5 });
        } else if (r.ok) {
          auditSuccess(profile?.employeeId ?? "", "coverage_cancelled", "Coverage", { targetId: coveredbyId });
        }
      });
      toast("Coverage cancelled.", "info");
    },
    [toast, repo],
  );

  const finishCoverage = useCallback(
    (coveredbyId: string, coveredHoursSpent: number) => {
      if (!profile) return;

      // Find the Coveredby record
      const coveredbyRec = coveredby.find((c) => c.id === coveredbyId);
      if (!coveredbyRec) return;

      const origId = coveredbyRec.originalCoverageId;

      // Update Coveredby record to Completed with actual hours spent
      setCoveredby((prev) =>
        prev.map((c) =>
          c.id === coveredbyId
            ? { ...c, coverageStatus: "Completed" as const, coveredHours: coveredHoursSpent }
            : c,
        ),
      );
      void safeWrite(
        "Coveredby finish",
        () => repo.updateCoveredby(coveredbyId, {
          coverageStatus: "Completed",
          coveredHours: coveredHoursSpent,
        }),
        { critical: true, retries: 2, toast },
      ).then((r) => {
        if (!r.ok && r.kind === "network") {
          enqueueWrite({ dedupKey: `finishCoveredby_${coveredbyId}`, opType: "updateCoveredby", payload: { id: coveredbyId, patch: { coverageStatus: "Completed", coveredHours: coveredHoursSpent } }, maxRetries: 5 });
        } else if (r.ok) {
          auditSuccess(profile?.employeeId ?? "", "coverage_finished", "Coverage", { targetId: coveredbyId, after: { coveredHours: coveredHoursSpent, coverageStatus: "Completed" } });
        }
      });

      // Update the original CoverageList record's coveredHours and forCoverageHours
      if (origId) {
        const originalRec = coverage.find((c) => c.id === origId);
        if (originalRec) {
          const newCoveredHours = (originalRec.coveredHours ?? 0) + coveredHoursSpent;
          const newForCoverageHours = Math.max(0, originalRec.forCoverageHours - coveredHoursSpent);
          const newStatus: CoverageRequest["coverageStatus"] =
            newForCoverageHours === 0 ? "Completed" : "Available";

          setCoverage((prev) =>
            prev.map((c) =>
              c.id === origId
                ? {
                    ...c,
                    coveredHours: newCoveredHours,
                    forCoverageHours: newForCoverageHours,
                    coverageStatus: newStatus,
                  }
                : c,
            ),
          );
          void safeWrite(
            "CoverageList update after finish",
            () => repo.updateCoverage(origId, {
              coveredHours: newCoveredHours,
              forCoverageHours: newForCoverageHours,
              coverageStatus: newStatus,
            }),
            { critical: true, retries: 2, toast },
          ).then((r) => {
            if (!r.ok && r.kind === "network") {
              enqueueWrite({ dedupKey: `updateCoverage_${origId}_finish`, opType: "updateCoverage", payload: { id: origId, patch: { coveredHours: newCoveredHours, forCoverageHours: newForCoverageHours, coverageStatus: newStatus } }, maxRetries: 5 });
            }
          });
        }
      }

      toast("Coverage completed! Great job.", "success");
    },
    [profile, toast, repo, coveredby, coverage],
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
        void safeWrite("Change leave date", () => repo.updateLeave(id, { status: "Change Pending", leaveDate: [newDate] }), { critical: true, retries: 2, toast });
      } else {
        setOt((prev) =>
          prev.map((o) =>
            o.id === id
              ? { ...o, status: "Change Pending" as const, otDate: newDate }
              : o,
          ),
        );
        void safeWrite("Change OT date", () => repo.updateOtRequest(id, { status: "Change Pending", otDate: newDate }), { critical: true, retries: 2, toast });
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
      void safeWrite("Notification read", () => repo.updateNotification(id, { readAt }));
    },
    [repo],
  );

  const deleteNotification = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      void safeWrite("Notification delete", () => repo.deleteNotification(id));
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
      themeMode,
      setThemeMode,
      toggleDark,
      navBlur,
      setNavBlur,
      reduceMotion,
      setReduceMotion,
      screen,
      navigate,
      back,
      canGoBack: stack.length > 0,
      profile: profile ?? EMPTY_PROFILE,
      attendance,
      leaves,
      ot,
      coverage,
      coveredby,
      infractions,
      holidays,
      notifications,
      clockIn,
      clockOut,
      clockBusy,
      updateNote,
      submitLeave,
      cancelLeave,
      submitOt,
      cancelOt,
      submitTechCoverage,
      takeoverCoverage,
      cancelCoverage,
      finishCoverage,
      changeLeaveDate,
      updateProfile,
      markNotificationRead,
      deleteNotification,
      toasts,
      toast,
      refreshData,
      hasHydrated,
    }),
    [
      session, signIn, signInWithEmployeeId, signOut, dark, themeMode, setThemeMode, toggleDark, navBlur, setNavBlur, reduceMotion, setReduceMotion, screen, navigate, back, stack.length,
      profile, attendance, leaves, ot, coverage, coveredby, infractions, holidays, notifications,
      clockIn, clockOut, clockBusy, updateNote, submitLeave, cancelLeave, submitOt, cancelOt,
      submitTechCoverage, takeoverCoverage, cancelCoverage, finishCoverage, changeLeaveDate, updateProfile,
      markNotificationRead, deleteNotification, toasts, toast, refreshData, hasHydrated,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
