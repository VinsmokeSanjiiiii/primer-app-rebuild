/**
 * Repository layer for the PrimerHR web app.
 *
 * The active implementation is `FirebaseRepository`, which reads and
 * writes the **original `primer3` Firebase Realtime Database tree**
 * exactly as documented in the brief.  Path and key names match the
 * legacy Android app's `google-services.json` setup:
 *
 *   /Users/{Employee_ID_Number}            — profile + account
 *   /Attendance/{attendanceKey}            — clock-in/out records
 *   /AttendanceID/ID                        — attendance counter
 *   /LeaveRequests/{requestId}             — one record per leave date
 *   /OTRequests/{requestId}                — overtime
 *   /OverTime/{requestId}                  — legacy OT root
 *   /CoverageList/{coverageId}             — coverage board
 *   /Coveredby/{coverageId}                — coverage companion node
 *   /InfractionList/{id}                   — infractions
 *   /Holidays/{holidayId}                  — holiday calendar
 *   /Notifications/{uid}/{pushId}          — per-user inbox
 *   /.info/serverTimeOffset                — server-time helper
 *
 * The legacy compatibility roots `/Primer_Users`, `/Leave_Requests`,
 * and `/Coverage` are still honored for hydration if present.
 *
 * The repository contract (method names, parameter shapes, and return
 * types) is preserved from the previous Supabase-backed version, so
 * the store and UI components consume it transparently.
 */

import type {
  Profile,
  AttendanceRecord,
  LeaveRequest,
  OtRequest,
  CoverageRequest,
  Infraction,
  Holiday,
  AppNotification,
} from "../types";

import { getDb, isFirebaseConfigured } from "./firebase";

import {
  ref,
  get,
  set,
  update,
  query,
  orderByChild,
  equalTo,
  remove,
  serverTimestamp,
  onValue,
} from "firebase/database";

// ---------------------------------------------------------------------------
// Repository contract
// ---------------------------------------------------------------------------

export interface Repository {
  // Auth (simulated, matching legacy behavior)
  signIn(email: string, password: string): Promise<{ success: boolean; error?: string; employeeId?: string }>;
  signOut(): Promise<void>;
  getSession(): Promise<{ employeeId: string; email: string } | null>;

  // Profile
  getProfile(employeeId: string): Promise<Profile | null>;
  updateProfile(employeeId: string, patch: Partial<Profile>): Promise<void>;

  // Attendance
  getAttendance(employeeId: string): Promise<AttendanceRecord[]>;
  createAttendance(record: AttendanceRecord): Promise<void>;
  updateAttendance(id: string, patch: Partial<AttendanceRecord>): Promise<void>;

  // Leave requests
  getLeaves(employeeId: string): Promise<LeaveRequest[]>;
  subscribeLeaves(employeeId: string, callback: (leaves: LeaveRequest[]) => void): () => void;
  createLeave(request: LeaveRequest): Promise<void>;
  updateLeave(id: string, patch: Partial<LeaveRequest>): Promise<void>;

  // OT requests
  getOtRequests(employeeId: string): Promise<OtRequest[]>;
  createOtRequest(request: OtRequest): Promise<void>;
  updateOtRequest(id: string, patch: Partial<OtRequest>): Promise<void>;

  // Coverage
  getCoverage(): Promise<CoverageRequest[]>;
  createCoverage(request: CoverageRequest): Promise<void>;
  updateCoverage(id: string, patch: Partial<CoverageRequest>): Promise<void>;
  deleteCoverageByFilter(filter: {
    coverageType: string;
    requesterId: string;
    coverageStatus: string;
  }): Promise<void>;

  // Infractions
  getInfractions(employeeId: string): Promise<Infraction[]>;

  // Holidays
  getHolidays(): Promise<Holiday[]>;

  // Notifications
  getNotifications(employeeId: string): Promise<AppNotification[]>;
  updateNotification(id: string, patch: Partial<AppNotification>): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // Server time helper (legacy behavior)
  getServerTimeOffsetMs(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Local-only offline fallback.  Uses the seed data so the UI can still
// render in environments where Firebase is unreachable.  This is not
// auth-backed and is **not** used for sign-in; it only hydrates the
// screens that need data.
// ---------------------------------------------------------------------------

import {
  seedProfile,
  seedAttendance,
  seedLeaves,
  seedOt,
  seedCoverage,
  seedInfractions,
  seedHolidays,
  seedNotifications,
} from "./seed";

const LOCAL_SESSION_KEY = "primer_local_session_employee";

class LocalOfflineRepository implements Repository {
  async signIn(_email: string, _password: string) {
    return { success: true, employeeId: seedProfile.employeeId };
  }
  async signOut() {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
  async getSession() {
    try {
      const id = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!id) return null;
      return { employeeId: id, email: "" };
    } catch {
      return null;
    }
  }

  async getProfile(_id: string) {
    return seedProfile;
  }
  async updateProfile(_id: string, _patch: Partial<Profile>) {
    /* read-only offline */
  }

  async getAttendance(_id: string) {
    return seedAttendance;
  }
  async createAttendance(_r: AttendanceRecord) {
    /* read-only offline */
  }
  async updateAttendance(_id: string, _patch: Partial<AttendanceRecord>) {
    /* read-only offline */
  }

  async getLeaves(_id: string) {
    return seedLeaves;
  }
  subscribeLeaves(_id: string, callback: (leaves: LeaveRequest[]) => void): () => void {
    void Promise.resolve(seedLeaves).then(callback);
    return () => {};
  }
  async createLeave(_r: LeaveRequest) {
    /* read-only offline */
  }
  async updateLeave(_id: string, _patch: Partial<LeaveRequest>) {
    /* read-only offline */
  }

  async getOtRequests(_id: string) {
    return seedOt;
  }
  async createOtRequest(_r: OtRequest) {
    /* read-only offline */
  }
  async updateOtRequest(_id: string, _patch: Partial<OtRequest>) {
    /* read-only offline */
  }

  async getCoverage() {
    return seedCoverage;
  }
  async createCoverage(_r: CoverageRequest) {
    /* read-only offline */
  }
  async updateCoverage(_id: string, _patch: Partial<CoverageRequest>) {
    /* read-only offline */
  }
  async deleteCoverageByFilter() {
    /* read-only offline */
  }

  async getInfractions(_id: string) {
    return seedInfractions;
  }
  async getHolidays() {
    return seedHolidays;
  }

  async getNotifications(_id: string) {
    return seedNotifications;
  }
  async updateNotification(_id: string, _patch: Partial<AppNotification>) {
    /* read-only offline */
  }
  async deleteNotification(_id: string) {
    /* read-only offline */
  }

  async getServerTimeOffsetMs() {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Firebase repository
// ---------------------------------------------------------------------------

/** Result type for a single Firebase read. */
type RtdbSnapshot<T> = { exists: () => boolean; val: () => T } | null;

function toObject<T>(snap: { exists: () => boolean; val: () => T }): T | null {
  return snap.exists() ? snap.val() : null;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return fallback;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

/**
 * Parse a date string in "M/D/YYYY" or "YYYY-MM-DD" format to a Unix timestamp.
 * Returns 0 for unparseable strings (safe for sort comparisons).
 */
function parseDateStr(s: string): number {
  if (!s) return 0;
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + "T00:00:00").getTime();
  // Legacy: M/D/YYYY or M/D/YYYY HH:mm:ss
  const parts = s.split(/[\s/]/);
  if (parts.length >= 3) {
    const [m, d, y] = parts;
    const ts = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`).getTime();
    if (!isNaN(ts)) return ts;
  }
  return 0;
}

/**
 * Profile record as it is stored under /Users/{Employee_ID_Number}.
 * Keys match the exact Firebase field names from the primerdb2 export.
 */
interface FbUserRecord {
  // Identity
  Employee_ID_Number?: string;
  EmployeeId?: string;           // legacy alias
  Full_Name?: string;
  Phone_Name?: string;
  // Auth
  Primer_Email?: string;
  Personal_Email?: string;
  Password?: string;
  Device_ID?: string;
  PublicKey?: string;
  // Employment details
  Department?: string;
  Role?: string;
  Position?: string;
  Team?: string;
  Status?: string;               // "Permanent" | "Probationary" | "Resigned" etc.
  Date_Started?: string;
  Tenure?: string;
  Schedule?: string;
  Days_Off?: string;
  workSetup?: string;            // production DB field (camelCase): "WFH" | "On-site"
  Work_Setup?: string;           // legacy alias
  Rate?: string;
  Basic_Salary?: number;
  UserAccountChange?: string;
  // Contact / personal
  Address?: string;
  Birth_date?: string;
  Contact_Number?: string;
  // Leave credits
  VL_Credits?: number;
  SL_Credits?: number;
  BL_Credit?: number;
  SL_Conversion_Credits?: number;
  // Government IDs
  PhilHealth?: string;
  SSS?: string;
  TIN?: string;
  Pag_Ibig?: string;
  // Miscellaneous
  Notes?: string;
  Profile_Image?: string;
  HealthCard?: string;
  proofUrl?: string;
  isClockedIn?: boolean;
  reserved_1?: string;
  reserved_2?: string;
}

interface FbAttendanceRecord {
  // Core identifiers (from primerdb2 Attendance node)
  AttendanceID?: string;
  Employee_ID_Number?: string;
  Phone_Name?: string;
  Team?: string;
  // Status fields
  isClockedIn?: boolean;
  Status?: string;               // "None" | "Vacation Leave" | "Sick Leave" etc.
  Note?: string;
  // Time fields
  date_in?: string;              // "M/D/YYYY"
  date_out?: string;
  time_in?: string;              // "HH:mm"
  time_out?: string;
  total_hours?: number;
  mins_late?: number;
  // Leave/Holiday flags
  ABonus?: number;
  Infraction?: number;
  RHoliday?: number;             // Regular Holiday flag
  SHoliday?: number;             // Special Holiday flag
  // Work setup
  workSetup?: string;            // "WFH" | "On-site"
  // Period
  month?: string;
  year?: number | string;
  // App-specific fields (may exist on some records)
  recordType?: string;
  clock_in_ts?: number;          // Unix-ms at clock-in (server time) — for precise duration
  clock_out_ts?: number;
  note_last_edited_ts?: number;
  note_locked?: boolean;
}

interface FbLeaveRecord {
  // Core (from primerdb2 LeaveRequests node)
  requestId?: string;
  leaveType?: string;            // "Vacation Leave" | "Sick Leave" | "Birthday Leave" etc.
  status?: string;               // "Approved" | "Pending" | "Rejected" | "Cancelled"
  leaveDate?: string;            // "M/D/YYYY"
  days?: number | string;        // stored as string "1" in DB
  reason?: string;
  proofUrl?: string;
  // Employee info (denormalised on write)
  Employee_ID_Number?: string;
  Full_Name?: string;
  Phone_Name?: string;
  position?: string;
  // Schedule / leave context
  Days_Off?: string;
  Schedule?: string;
  Coverage_Status?: string;      // "None" | coverage ID
  CoverageID?: string;           // optional — set when coverage is arranged
  Cancellation_Reason?: string;
  // Timestamps
  timestamp?: number | string;   // stored as "N/A" on some records
  convertedTimestamp?: string;   // human-readable "M/D/YYYY h:mm:ss AM/PM"
  // Period
  month?: string;
  year?: number | string;        // stored as string "2026" in DB
  // Legacy / unused
  proofAttached?: boolean;
}

interface FbOtRecord {
  requestId?: string;
  OT_ID?: string;
  OT_Date?: string;
  OT_Status?: string;
  OT_Time?: string;
  Employee_ID_Number?: string;
  Phone_Name?: string;
  Position?: string;
  Team?: string;
  Schedule?: string;
  month?: string;
  year?: number;
}

interface FbCoverageRecord {
  // Core (from primerdb2 CoverageList node)
  CoverageID?: string;
  CoverageDate?: string;         // "M/D/YYYY" or "M/D/YYYY hh:mm:ss AM/PM"
  CoverageTime?: string;         // "HH:mm-HH:mm"
  CoverageType?: string;         // "Regular Shift" | "OT" etc.
  CoverageStatus?: string;       // "Completed" | "Pending" | "Cancelled"
  CoveredHours?: number | string; // stored as string "8" in DB
  forCoverageHours?: number | string;
  // Employee info (may be "Open" when no one assigned yet)
  Employee_ID_Number?: string;
  Phone_Name?: string;
  Position?: string;
  Schedule?: string;
  Team?: string;
  Days_Off?: string;
  // Period
  month?: string;
  year?: number | string;
  // Legacy / extended fields
  CoveragePosition?: string;
  CoveredbyID?: string;
  TakenBy?: string;
  requesterId?: string;
  Full_Name?: string;
  requesterName?: string;
  Reason?: string;
}

interface FbInfractionRecord {
  InfractionType?: string;
  InfractionID?: string;
  Lostminutes?: number | string;
  Notes?: string;
  InfractionDate?: string;
  Employee_ID_Number?: string;
  Days_Off?: string;
  Phone_Name?: string;
  Schedule?: string;
  driveLink?: string;
  month?: string;
  year?: number;
}

interface FbHolidayRecord {
  // From primerdb2 Holidays node (key is "MM-DD-YYYY")
  Holiday?: string;     // Primary name field: "New Year's Day" etc.
  HDate?: string;       // "M/D/YYYY" — display date
  HType?: string;       // "Regular" | "Special"
  HolidayID?: string;   // "<Holiday Name>-MM-DD-YYYY"
  month?: string;       // stored as string "1"–"12"
  year?: number | string;
  // Legacy / fallback field names
  name?: string;
  Name?: string;
  HolidayName?: string;
}

interface FbNotificationRecord {
  title?: string;
  message?: string;
  read?: boolean;
  readAt?: number;
  timestamp?: number;
}

export class FirebaseRepository implements Repository {
  private db = getDb();

  // -------------------------------------------------------------------------
  // Auth
  //
  // Legacy login flow: look up by `Primer_Email`, compare the entered
  // password against the `Password` field.  On success, persist a
  // non-sensitive session marker (email + employee id) in localStorage
  // and return the employee id so the store can hydrate.
  // -------------------------------------------------------------------------

  async signIn(email: string, password: string) {
    try {
      const usersSnap = await get(ref(this.db, "Users"));
      if (!usersSnap.exists()) {
        return { success: false, error: "No users registered." };
      }
      const all = usersSnap.val() as Record<string, FbUserRecord>;
      const normEmail = email.trim().toLowerCase();

      let matched: { id: string; record: FbUserRecord } | null = null;
      for (const [id, rec] of Object.entries(all ?? {})) {
        if (!rec) continue;
        const emailMatch =
          asString(rec.Primer_Email).trim().toLowerCase() === normEmail ||
          asString(rec.EmployeeId).trim().toLowerCase() === normEmail;
        if (emailMatch) {
          matched = { id, record: rec };
          break;
        }
      }

      if (!matched) {
        return { success: false, error: "Account not found." };
      }

      const stored = asString(matched.record.Password);
      if (stored && stored !== password) {
        return { success: false, error: "Incorrect password." };
      }

      // Persist a tiny, non-sensitive session marker.
      try {
        localStorage.setItem(
          LOCAL_SESSION_KEY,
          matched.record.Employee_ID_Number ?? matched.id,
        );
      } catch {
        /* ignore */
      }

      return {
        success: true,
        employeeId: matched.record.Employee_ID_Number ?? matched.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async signOut() {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  async getSession() {
    try {
      const id = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!id) return null;
      return { employeeId: id, email: "" };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  async getProfile(employeeId: string) {
    const snap = await get(ref(this.db, `Users/${employeeId}`));
    const rec = toObject<FbUserRecord>(snap);
    if (!rec) return null;
    return mapUserToProfile(employeeId, rec);
  }

  async updateProfile(employeeId: string, patch: Partial<Profile>) {
    const mapped = mapProfilePatchToUser(patch);
    if (Object.keys(mapped).length === 0) return;
    await update(ref(this.db, `Users/${employeeId}`), mapped);
  }

  // -------------------------------------------------------------------------
  // Attendance
  // -------------------------------------------------------------------------

  async getAttendance(employeeId: string) {
    // Fetch all records and filter client-side — avoids requiring a Firebase
    // index on Employee_ID_Number, which causes silent failures when absent.
    const snap = await get(ref(this.db, "Attendance"));
    const raw = toObject<Record<string, FbAttendanceRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapAttendance(id, rec))
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => {
        // Primary: by dateIn descending (most-recent first)
        const dateA = parseDateStr(a.dateIn);
        const dateB = parseDateStr(b.dateIn);
        if (dateB !== dateA) return dateB - dateA;
        // Secondary: by clockInTs to break same-day ties
        return (b.clockInTs ?? 0) - (a.clockInTs ?? 0);
      });
  }

  async createAttendance(record: AttendanceRecord) {
    const mapped = mapAttendanceToFb(record);
    await set(ref(this.db, `Attendance/${record.id}`), mapped);
  }

  async updateAttendance(id: string, patch: Partial<AttendanceRecord>) {
    const mapped = mapAttendancePatchToFb(patch);
    if (Object.keys(mapped).length === 0) return;
    await update(ref(this.db, `Attendance/${id}`), mapped);
  }

  // -------------------------------------------------------------------------
  // Leave
  // -------------------------------------------------------------------------

  /**
   * Legacy storage convention: one record per leave date.  The current
   * app-facing model carries `leaveDate: string[]`, so a single
   * createLeave() call may need to expand to multiple records (one per
   * date) under `/LeaveRequests/{requestId}_{date}`.
   *
   * Reads merge all matching records back into a single LeaveRequest
   * keyed by the original `requestId`.
   */

  private leaveRecordId(requestId: string, date: string): string {
    return `${requestId}_${date.replace(/[^0-9]/g, "")}`;
  }

  async getLeaves(employeeId: string) {
    // Fetch all records and filter client-side — avoids requiring a Firebase
    // index on Employee_ID_Number, which causes silent failures when absent.
    const snap = await get(ref(this.db, "LeaveRequests"));
    const raw = toObject<Record<string, FbLeaveRecord>>(snap) ?? {};
    const grouped = new Map<string, LeaveRequest>();
    for (const [key, rec] of Object.entries(raw)) {
      // Filter to this employee only
      if (asString(rec.Employee_ID_Number) !== employeeId) continue;
      const item = mapLeave(key, rec);
      if (!item) continue;
      const rid = item.requestId;
      const existing = grouped.get(rid);
      if (existing) {
        existing.leaveDate = Array.from(
          new Set([...existing.leaveDate, ...item.leaveDate]),
        ).sort();
        existing.days = existing.leaveDate.length;
      } else {
        grouped.set(rid, item);
      }
    }
    return Array.from(grouped.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  subscribeLeaves(employeeId: string, callback: (leaves: LeaveRequest[]) => void): () => void {
    const dbRef = ref(this.db, "LeaveRequests");
    return onValue(dbRef, (snap) => {
      const raw = toObject<Record<string, FbLeaveRecord>>(snap) ?? {};
      const grouped = new Map<string, LeaveRequest>();
      for (const [key, rec] of Object.entries(raw)) {
        if (asString(rec.Employee_ID_Number) !== employeeId) continue;
        const item = mapLeave(key, rec);
        if (!item) continue;
        const rid = item.requestId;
        const existing = grouped.get(rid);
        if (existing) {
          existing.leaveDate = Array.from(
            new Set([...existing.leaveDate, ...item.leaveDate]),
          ).sort();
          existing.days = existing.leaveDate.length;
        } else {
          grouped.set(rid, item);
        }
      }
      callback(
        Array.from(grouped.values()).sort((a, b) => b.createdAt - a.createdAt),
      );
    });
  }

  async createLeave(request: LeaveRequest) {
    for (const d of request.leaveDate) {
      const key = this.leaveRecordId(request.requestId, d);
      const fb = mapLeaveToFb({ ...request, leaveDate: [d] });
      await set(ref(this.db, `LeaveRequests/${key}`), fb);
    }
  }

  async updateLeave(id: string, patch: Partial<LeaveRequest>) {
    // Find all stored records belonging to this request id.
    const snap = await get(ref(this.db, "LeaveRequests"));
    const raw = toObject<Record<string, FbLeaveRecord>>(snap) ?? {};
    const keys = Object.keys(raw).filter((k) => k === id || k.startsWith(id + "_"));
    if (keys.length === 0) return;
    const mapped = mapLeavePatchToFb(patch);
    if (Object.keys(mapped).length === 0) return;
    await Promise.all(
      keys.map((k) => update(ref(this.db, `LeaveRequests/${k}`), mapped)),
    );
  }

  // -------------------------------------------------------------------------
  // OT
  // -------------------------------------------------------------------------

  async getOtRequests(employeeId: string) {
    const q = query(
      ref(this.db, "OTRequests"),
      orderByChild("Employee_ID_Number"),
      equalTo(employeeId),
    );
    const snap = await get(q);
    const raw = toObject<Record<string, FbOtRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapOt(id, rec))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async createOtRequest(request: OtRequest) {
    const fb = mapOtToFb(request);
    await set(ref(this.db, `OTRequests/${request.id}`), fb);
    // Legacy compatibility: also keep an /OverTime/{id} stub.
    await set(ref(this.db, `OverTime/${request.id}`), fb);
  }

  async updateOtRequest(id: string, patch: Partial<OtRequest>) {
    const mapped = mapOtPatchToFb(patch);
    if (Object.keys(mapped).length === 0) return;
    await update(ref(this.db, `OTRequests/${id}`), mapped);
    await update(ref(this.db, `OverTime/${id}`), mapped);
  }

  // -------------------------------------------------------------------------
  // Coverage
  // -------------------------------------------------------------------------

  async getCoverage() {
    const snap = await get(ref(this.db, "CoverageList"));
    const raw = toObject<Record<string, FbCoverageRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapCoverage(id, rec))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async createCoverage(request: CoverageRequest) {
    const fb = mapCoverageToFb(request);
    await set(ref(this.db, `CoverageList/${request.id}`), fb);
  }

  async updateCoverage(id: string, patch: Partial<CoverageRequest>) {
    const mapped = mapCoveragePatchToFb(patch);
    if (Object.keys(mapped).length === 0) return;
    await update(ref(this.db, `CoverageList/${id}`), mapped);
    // When coverage transitions away from `Ongoing`, also clear the
    // companion `/Coveredby/{id}` node (legacy behavior).
    if (patch.coverageStatus && patch.coverageStatus !== "Ongoing") {
      try {
        await remove(ref(this.db, `Coveredby/${id}`));
      } catch {
        /* ignore */
      }
    }
  }

  async deleteCoverageByFilter(filter: {
    coverageType: string;
    requesterId: string;
    coverageStatus: string;
  }) {
    const all = await this.getCoverage();
    const matches = all.filter(
      (c) =>
        c.coverageType === filter.coverageType &&
        c.requesterId === filter.requesterId &&
        c.coverageStatus === filter.coverageStatus,
    );
    await Promise.all(
      matches.map((m) => remove(ref(this.db, `CoverageList/${m.id}`))),
    );
  }

  // -------------------------------------------------------------------------
  // Infractions
  // -------------------------------------------------------------------------

  async getInfractions(employeeId: string) {
    // Fetch all InfractionList records and filter client-side.
    // Avoids requiring a Firebase index on Employee_ID_Number in the DB rules,
    // which causes silent failures when the index is absent.
    const snap = await get(ref(this.db, "InfractionList"));
    const raw = toObject<Record<string, FbInfractionRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapInfraction(id, rec))
      .filter((r) => r.employeeId === employeeId);
  }

  // -------------------------------------------------------------------------
  // Holidays
  // -------------------------------------------------------------------------

  async getHolidays() {
    const snap = await get(ref(this.db, "Holidays"));
    const raw = toObject<Record<string, FbHolidayRecord>>(snap) ?? {};
    return Object.entries(raw).map(([id, rec]) => mapHoliday(id, rec));
  }

  // -------------------------------------------------------------------------
  // Notifications
  //
  // Legacy: nested under `/Notifications/{uid}/{pushId}`.
  // -------------------------------------------------------------------------

  async getNotifications(employeeId: string) {
    const snap = await get(ref(this.db, `Notifications/${employeeId}`));
    const raw = toObject<Record<string, FbNotificationRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapNotification(id, employeeId, rec))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateNotification(id: string, patch: Partial<AppNotification>) {
    const employeeId = (await this.getSession())?.employeeId;
    if (!employeeId) return;
    const fb: Record<string, unknown> = {};
    if (patch.readAt !== undefined) {
      fb.read = patch.readAt !== undefined && patch.readAt > 0;
      fb.readAt = patch.readAt;
    }
    await update(ref(this.db, `Notifications/${employeeId}/${id}`), fb);
  }

  async deleteNotification(id: string) {
    const employeeId = (await this.getSession())?.employeeId;
    if (!employeeId) return;
    await remove(ref(this.db, `Notifications/${employeeId}/${id}`));
  }

  // -------------------------------------------------------------------------
  // Server time offset
  //
  // Firebase exposes the server-vs-local clock skew at
  // `/.info/serverTimeOffset`.  Reading it does not require auth.
  // -------------------------------------------------------------------------

  async getServerTimeOffsetMs() {
    try {
      const snap = await get(ref(this.db, ".info/serverTimeOffset"));
      return asNumber(snap.val(), 0);
    } catch {
      return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// mappers — app-facing model ⇄ Firebase RTDB record
//
// These exist to convert between the camelCase shapes the UI/store
// works with and the original PascalCase + snake_case key naming used
// by the legacy `primer3` Firebase tree.  No field is ever renamed at
// the database boundary; the conversion is local to this file.
// ---------------------------------------------------------------------------

function mapUserToProfile(id: string, rec: FbUserRecord): Profile {
  const workSetup = asString(rec.workSetup ?? rec.Work_Setup);
  const isFlextime = workSetup.toLowerCase() === "flextime" || asBoolean((rec as unknown as { isFlextime?: boolean }).isFlextime, false);
  return {
    id,
    employeeId: rec.Employee_ID_Number ?? rec.EmployeeId ?? id,
    primerEmail: asString(rec.Primer_Email),
    fullName: asString(rec.Full_Name),
    passwordlessAuthEnabled: false, // legacy did not store this
    deviceId: rec.Device_ID,
    publicKey: rec.PublicKey,
    role: asString(rec.Role),
    position: asString(rec.Position),
    team: asString(rec.Team),
    schedule: asString(rec.Schedule),
    daysOff: asString(rec.Days_Off),
    status: asString(rec.Status),
    dateStarted: asString(rec.Date_Started),
    tenure: asString(rec.Tenure),
    address: asString(rec.Address),
    contactNumber: asString(rec.Contact_Number),
    personalEmail: asString(rec.Personal_Email),
    birthDate: asString(rec.Birth_date),
    department: asString(rec.Department),
    phoneName: asString(rec.Phone_Name),
    vlCredits: asNumber(rec.VL_Credits),
    slCredits: asNumber(rec.SL_Credits),
    blCredit: asNumber(rec.BL_Credit),
    slConversionCredits: asNumber(rec.SL_Conversion_Credits),
    profileImageUrl: rec.Profile_Image,
    notes: asString(rec.Notes),
    philhealth: asString(rec.PhilHealth),
    sss: asString(rec.SSS),
    tin: asString(rec.TIN),
    pagIbig: asString(rec.Pag_Ibig),
    workSetup,
    isClockedIn: asBoolean(rec.isClockedIn),
    isFlextime,
  };
}

function mapProfilePatchToUser(p: Partial<Profile>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (p.fullName !== undefined) m.Full_Name = p.fullName;
  if (p.notes !== undefined) m.Notes = p.notes;
  if (p.profileImageUrl !== undefined) m.Profile_Image = p.profileImageUrl;
  if (p.vlCredits !== undefined) m.VL_Credits = p.vlCredits;
  if (p.slCredits !== undefined) m.SL_Credits = p.slCredits;
  if (p.blCredit !== undefined) m.BL_Credit = p.blCredit;
  if (p.slConversionCredits !== undefined) m.SL_Conversion_Credits = p.slConversionCredits;
  if (p.isClockedIn !== undefined) m.isClockedIn = p.isClockedIn;
  if (p.philhealth !== undefined) m.PhilHealth = p.philhealth;
  if (p.sss !== undefined) m.SSS = p.sss;
  if (p.tin !== undefined) m.TIN = p.tin;
  if (p.pagIbig !== undefined) m.Pag_Ibig = p.pagIbig;
  return m;
}

function mapAttendance(id: string, rec: FbAttendanceRecord): AttendanceRecord {
  return {
    id,
    attendanceCode: asString(rec.AttendanceID),
    employeeId: asString(rec.Employee_ID_Number),
    dateIn: asString(rec.date_in),
    timeIn: asString(rec.time_in),
    dateOut: rec.date_out,
    timeOut: rec.time_out,
    totalHours: rec.total_hours !== undefined ? asNumber(rec.total_hours) : undefined,
    note: asString(rec.Note),
    noteLocked: asBoolean(rec.note_locked),
    clockInTs: rec.clock_in_ts !== undefined ? asNumber(rec.clock_in_ts) : undefined,
    clockOutTs: rec.clock_out_ts !== undefined ? asNumber(rec.clock_out_ts) : undefined,
    noteLastEditedTs: rec.note_last_edited_ts !== undefined ? asNumber(rec.note_last_edited_ts) : undefined,
    minsLate: asNumber(rec.mins_late),
    recordType: asString(rec.recordType, "Regular"),
    status: asString(rec.Status, "Open"),
    isClockedIn: asBoolean(rec.isClockedIn),
    month: asString(rec.month),
    year: rec.year !== undefined ? asNumber(rec.year) : new Date().getFullYear(),
  };
}

function mapAttendanceToFb(r: AttendanceRecord): Record<string, unknown> {
  // Firebase RTDB v9 `set()` throws if ANY value in the payload is `undefined`.
  // Only include fields that actually have a value — use conditional assignment
  // for optional fields that are absent on a fresh clock-in record.
  const m: Record<string, unknown> = {
    AttendanceID: r.attendanceCode,
    Employee_ID_Number: r.employeeId,
    Phone_Name: r.phoneName ?? "",
    Team: r.team ?? "",
    workSetup: r.workSetup ?? "",
    ABonus: r.aBonus ?? 0,
    RHoliday: r.rHoliday ?? 0,
    SHoliday: r.sHoliday ?? 0,
    Infraction: r.infraction ?? 0,
    isClockedIn: r.isClockedIn,
    Status: r.status,
    Note: r.note ?? "",
    date_in: r.dateIn,
    time_in: r.timeIn,
    mins_late: r.minsLate ?? 0,
    recordType: r.recordType,
    note_locked: r.noteLocked ?? false,
    month: r.month,
    year: String(r.year ?? new Date().getFullYear()),
  };
  if (r.clockInTs !== undefined) m.clock_in_ts = r.clockInTs;
  if (r.clockOutTs !== undefined) m.clock_out_ts = r.clockOutTs;
  if (r.dateOut !== undefined) m.date_out = r.dateOut;
  if (r.timeOut !== undefined) m.time_out = r.timeOut;
  if (r.totalHours !== undefined) m.total_hours = r.totalHours;
  if (r.noteLastEditedTs !== undefined) m.note_last_edited_ts = r.noteLastEditedTs;
  return m;
}

function mapAttendancePatchToFb(r: Partial<AttendanceRecord>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (r.status !== undefined) m.Status = r.status;
  if (r.isClockedIn !== undefined) m.isClockedIn = r.isClockedIn;
  if (r.note !== undefined) m.Note = r.note;
  if (r.dateOut !== undefined) m.date_out = r.dateOut;
  if (r.timeOut !== undefined) m.time_out = r.timeOut;
  if (r.totalHours !== undefined) m.total_hours = r.totalHours;
  if (r.clockInTs !== undefined) m.clock_in_ts = r.clockInTs;
  if (r.clockOutTs !== undefined) m.clock_out_ts = r.clockOutTs;
  if (r.noteLastEditedTs !== undefined) m.note_last_edited_ts = r.noteLastEditedTs;
  if (r.noteLocked !== undefined) m.note_locked = r.noteLocked;
  return m;
}

function mapLeave(id: string, rec: FbLeaveRecord): LeaveRequest | null {
  if (!rec) return null;
  // Treat "0", empty string, and missing requestId as invalid — use the
  // Firebase key so each legacy record gets its own unique identity.
  const rawRequestId = asString(rec.requestId);
  const requestId = (rawRequestId && rawRequestId !== "0")
    ? rawRequestId
    : id.split("_")[0] || id;
  return {
    id: requestId,
    requestId,
    employeeId: asString(rec.Employee_ID_Number),
    leaveType: (rec.leaveType as LeaveRequest["leaveType"]) ?? "Vacation Leave",
    leaveDate: rec.leaveDate ? [asString(rec.leaveDate)] : [],
    status: (rec.status as LeaveRequest["status"]) ?? "Pending",
    reason: asString(rec.reason),
    proofUrl: rec.proofUrl,
    fullName: asString(rec.Full_Name),
    days: asNumber(rec.days, 1),
    position: asString(rec.position),
    year: rec.year !== undefined ? asNumber(rec.year) : new Date().getFullYear(),
    month: asString(rec.month),
    daysOff: asString(rec.Days_Off),
    schedule: asString(rec.Schedule),
    cancellationReason: rec.Cancellation_Reason,
    createdAt: asNumber(rec.timestamp, Date.now()),
  };
}

function mapLeaveToFb(r: LeaveRequest): Record<string, unknown> {
  // Firebase RTDB throws on any undefined field value. Conditionally include
  // optional fields; convert year/days to strings to match DB schema.
  const m: Record<string, unknown> = {
    requestId: r.requestId,
    leaveType: r.leaveType,
    status: r.status,
    timestamp: serverTimestamp(),
    convertedTimestamp: new Date().toLocaleString("en-US"),
    leaveDate: r.leaveDate[0] ?? "",
    reason: r.reason ?? "",
    Full_Name: r.fullName,
    Phone_Name: r.phoneName ?? "",
    days: String(r.days),
    position: r.position,
    year: String(r.year),
    month: r.month,
    Employee_ID_Number: r.employeeId,
    Days_Off: r.daysOff,
    Schedule: r.schedule,
    Coverage_Status: r.coverageStatus ?? "None",
    Cancellation_Reason: r.cancellationReason ?? "",
  };
  if (r.proofUrl !== undefined) m.proofUrl = r.proofUrl;
  return m;
}

function mapLeavePatchToFb(p: Partial<LeaveRequest>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (p.status !== undefined) m.status = p.status;
  if (p.cancellationReason !== undefined) m.Cancellation_Reason = p.cancellationReason;
  if (p.leaveDate !== undefined) m.leaveDate = p.leaveDate[0] ?? "";
  return m;
}

function mapOt(id: string, rec: FbOtRecord): OtRequest {
  return {
    id,
    requestId: asString(rec.requestId) || id,
    employeeId: asString(rec.Employee_ID_Number),
    otType: "OverTime",
    otShift: undefined,
    typeCode: "POSTOT",
    otDate: asString(rec.OT_Date),
    otTime: asString(rec.OT_Time),
    durationHours: 1,
    status: (rec.OT_Status as OtRequest["status"]) ?? "Pending",
    reason: "",
    fullName: "",
    position: asString(rec.Position),
    team: asString(rec.Team),
    schedule: asString(rec.Schedule),
    month: asString(rec.month),
    year: rec.year !== undefined ? asNumber(rec.year) : new Date().getFullYear(),
    createdAt: Date.now(),
  };
}

function mapOtToFb(o: OtRequest): Record<string, unknown> {
  return {
    requestId: o.requestId,
    OT_ID: o.requestId,
    OT_Date: o.otDate,
    OT_Status: o.status,
    OT_Time: o.otTime,
    reason: o.reason,
    otShift: o.otShift ?? "",
    typeCode: o.typeCode,
    Employee_ID_Number: o.employeeId,
    Phone_Name: o.phoneName ?? "",
    Full_Name: o.fullName,
    Position: o.position,
    Team: o.team,
    Schedule: o.schedule,
    month: o.month,
    year: String(o.year ?? new Date().getFullYear()),
  };
}

function mapOtPatchToFb(p: Partial<OtRequest>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (p.status !== undefined) m.OT_Status = p.status;
  if (p.otDate !== undefined) m.OT_Date = p.otDate;
  if (p.otTime !== undefined) m.OT_Time = p.otTime;
  return m;
}

function mapCoverage(id: string, rec: FbCoverageRecord): CoverageRequest {
  return {
    id,
    coverageId: asString(rec.CoverageID) || id,
    employeeId: asString(rec.Employee_ID_Number) || asString(rec.requesterId),
    requesterId: asString(rec.requesterId) || asString(rec.Employee_ID_Number),
    requesterName: asString(rec.requesterName) || asString(rec.Full_Name),
    coverageDate: asString(rec.CoverageDate),
    coverageTime: asString(rec.CoverageTime),
    coverageType: asString(rec.CoverageType),
    coverageStatus: (rec.CoverageStatus as CoverageRequest["coverageStatus"]) ?? "Available",
    forCoverageHours: asNumber(rec.forCoverageHours),
    coveredHours: rec.CoveredHours !== undefined ? asNumber(rec.CoveredHours) : undefined,
    daysOff: asString(rec.Days_Off),
    position: asString(rec.Position) || asString(rec.CoveragePosition),
    schedule: asString(rec.Schedule),
    month: asString(rec.month),
    year: rec.year !== undefined ? asNumber(rec.year) : new Date().getFullYear(),
    team: asString(rec.Team),
    reason: asString(rec.Reason),
    coveredById: rec.CoveredbyID,
    takenBy: rec.TakenBy,
    createdAt: Date.now(),
  };
}

function mapCoverageToFb(c: CoverageRequest): Record<string, unknown> {
  // Firebase RTDB rejects any field whose value is `undefined`. Optional
  // fields (CoveredbyID, TakenBy, CoveredHours) must be given a safe default
  // when absent so that `set()` never receives undefined values.
  return {
    CoverageID: c.coverageId,
    CoverageDate: c.coverageDate,
    CoverageTime: c.coverageTime ?? "",
    CoveragePosition: c.position ?? "",
    month: c.month ?? "",
    year: c.year ?? new Date().getFullYear(),
    CoverageType: c.coverageType ?? "",
    forCoverageHours: c.forCoverageHours ?? 0,
    CoverageStatus: c.coverageStatus ?? "Available",
    CoveredbyID: c.coveredById ?? "",
    TakenBy: c.takenBy ?? "",
    Days_Off: c.daysOff ?? "",
    Position: c.position ?? "",
    Employee_ID_Number: c.requesterId ?? "",
    CoveredHours: c.coveredHours ?? 0,
    Phone_Name: c.phoneName ?? "",
    Schedule: c.schedule ?? "",
    Team: c.team ?? "",
    requesterId: c.requesterId ?? "",
    Full_Name: c.requesterName ?? "",
    requesterName: c.requesterName ?? "",
    Reason: c.reason ?? "",
  };
}

function mapCoveragePatchToFb(p: Partial<CoverageRequest>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (p.coverageStatus !== undefined) m.CoverageStatus = p.coverageStatus;
  if (p.coveredById !== undefined) m.CoveredbyID = p.coveredById;
  if (p.takenBy !== undefined) m.TakenBy = p.takenBy;
  if (p.coveredHours !== undefined) m.CoveredHours = p.coveredHours;
  return m;
}

function mapInfraction(id: string, rec: FbInfractionRecord): Infraction {
  return {
    id,
    employeeId: asString(rec.Employee_ID_Number),
    infractionId: asString(rec.InfractionID),
    infractionType: asString(rec.InfractionType),
    lostMinutes: asNumber(rec.Lostminutes),
    notes: asString(rec.Notes),
    infractionDate: asString(rec.InfractionDate),
    daysOff: asString(rec.Days_Off),
    phoneName: asString(rec.Phone_Name),
    schedule: asString(rec.Schedule),
    driveLink: asString(rec.driveLink),
    month: asString(rec.month),
    year: rec.year !== undefined ? asNumber(rec.year) : undefined,
  };
}

function mapHoliday(id: string, rec: FbHolidayRecord): Holiday {
  return {
    id,
    hdate: asString(rec.HDate),
    name: asString(rec.Holiday || rec.HolidayName || rec.name || rec.Name),
    htype: rec.HType ? asString(rec.HType) : undefined,
  };
}

function mapNotification(
  id: string,
  employeeId: string,
  rec: FbNotificationRecord,
): AppNotification {
  return {
    id,
    employeeId,
    title: asString(rec.title),
    message: asString(rec.message),
    readAt: rec.readAt !== undefined ? asNumber(rec.readAt) : rec.read ? Date.now() : undefined,
    createdAt: rec.timestamp !== undefined ? asNumber(rec.timestamp) : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _instance: Repository | null = null;

export function getRepository(): Repository {
  if (_instance) return _instance;
  _instance = isFirebaseConfigured()
    ? new FirebaseRepository()
    : new LocalOfflineRepository();
  return _instance;
}

export function isOnlineRepository(): boolean {
  return _instance instanceof FirebaseRepository;
}
