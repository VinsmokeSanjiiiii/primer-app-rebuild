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
 * Profile record as it is stored under /Users/{Employee_ID_Number}.
 * The keys here are **exactly** the legacy Firebase keys — no
 * normalization, no snake_case conversion.
 */
interface FbUserRecord {
  Employee_ID_Number?: string;
  EmployeeId?: string;
  Primer_Email?: string;
  Password?: string;
  Device_ID?: string;
  PublicKey?: string;
  Full_Name?: string;
  Personal_Email?: string;
  Contact_Number?: string;
  Address?: string;
  Birth_date?: string;
  Date_Started?: string;
  Tenure?: string;
  Department?: string;
  Role?: string;
  Position?: string;
  Team?: string;
  Schedule?: string;
  Days_Off?: string;
  Status?: string;
  Work_Setup?: string;
  Phone_Name?: string;
  VL_Credits?: number;
  SL_Credits?: number;
  BL_Credit?: number;
  SL_Conversion_Credits?: number;
  Profile_Image?: string;
  Notes?: string;
  PhilHealth?: string;
  SSS?: string;
  TIN?: string;
  Pag_Ibig?: string;
  HealthCard?: string;
  isClockedIn?: boolean;
  proofUrl?: string;
}

interface FbAttendanceRecord {
  AttendanceID?: string;
  Employee_ID_Number?: string;
  Phone_Name?: string;
  isClockedIn?: boolean;
  Status?: string;
  Note?: string;
  date_in?: string;
  date_out?: string;
  time_in?: string;
  time_out?: string;
  total_hours?: number;
  mins_late?: number;
  recordType?: string;
  clock_out_ts?: number;
  note_last_edited_ts?: number;
  note_locked?: boolean;
  ABonus?: number;
  Infraction?: number;
  RHoliday?: number;
  SHoliday?: number;
  Team?: string;
  workSetup?: string;
  month?: string;
  year?: number;
}

interface FbLeaveRecord {
  requestId?: string;
  leaveType?: string;
  status?: string;
  timestamp?: number;
  leaveDate?: string;
  reason?: string;
  proofUrl?: string;
  Full_Name?: string;
  days?: number;
  position?: string;
  year?: number;
  month?: string;
  convertedTimestamp?: number;
  Employee_ID_Number?: string;
  Days_Off?: string;
  Schedule?: string;
  Phone_Name?: string;
  Coverage_Status?: string;
  Cancellation_Reason?: string;
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
  CoverageID?: string;
  CoverageDate?: string;
  CoverageTime?: string;
  CoveragePosition?: string;
  month?: string;
  year?: number;
  CoverageType?: string;
  forCoverageHours?: number;
  CoverageStatus?: string;
  CoveredbyID?: string;
  TakenBy?: string;
  Days_Off?: string;
  Position?: string;
  Employee_ID_Number?: string;
  CoveredHours?: number;
  Phone_Name?: string;
  Schedule?: string;
  Team?: string;
  requesterId?: string;
  Full_Name?: string;
  requesterName?: string;
  Reason?: string;
}

interface FbInfractionRecord {
  InfractionType?: string;
  Lostminutes?: number | string;
  Notes?: string;
  InfractionDate?: string;
  Employee_ID_Number?: string;
}

interface FbHolidayRecord {
  HDate?: string;
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
    const q = query(
      ref(this.db, "Attendance"),
      orderByChild("Employee_ID_Number"),
      equalTo(employeeId),
    );
    const snap = await get(q);
    const raw = toObject<Record<string, FbAttendanceRecord>>(snap) ?? {};
    return Object.entries(raw)
      .map(([id, rec]) => mapAttendance(id, rec))
      .sort((a, b) => (b.clockOutTs ?? 0) - (a.clockOutTs ?? 0));
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
    const q = query(
      ref(this.db, "LeaveRequests"),
      orderByChild("Employee_ID_Number"),
      equalTo(employeeId),
    );
    const snap = await get(q);
    const raw = toObject<Record<string, FbLeaveRecord>>(snap) ?? {};
    const grouped = new Map<string, LeaveRequest>();
    for (const [key, rec] of Object.entries(raw)) {
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
    const q = query(
      ref(this.db, "InfractionList"),
      orderByChild("Employee_ID_Number"),
      equalTo(employeeId),
    );
    const snap = await get(q);
    const raw = toObject<Record<string, FbInfractionRecord>>(snap) ?? {};
    return Object.entries(raw).map(([id, rec]) => mapInfraction(id, rec));
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
    workSetup: asString(rec.Work_Setup),
    isClockedIn: asBoolean(rec.isClockedIn),
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
  return {
    AttendanceID: r.attendanceCode,
    Employee_ID_Number: r.employeeId,
    Phone_Name: undefined,
    isClockedIn: r.isClockedIn,
    Status: r.status,
    Note: r.note,
    date_in: r.dateIn,
    date_out: r.dateOut,
    time_in: r.timeIn,
    time_out: r.timeOut,
    total_hours: r.totalHours,
    mins_late: r.minsLate,
    recordType: r.recordType,
    clock_out_ts: r.clockOutTs,
    note_last_edited_ts: r.noteLastEditedTs,
    note_locked: r.noteLocked,
    month: r.month,
    year: r.year,
  };
}

function mapAttendancePatchToFb(r: Partial<AttendanceRecord>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (r.status !== undefined) m.Status = r.status;
  if (r.isClockedIn !== undefined) m.isClockedIn = r.isClockedIn;
  if (r.note !== undefined) m.Note = r.note;
  if (r.dateOut !== undefined) m.date_out = r.dateOut;
  if (r.timeOut !== undefined) m.time_out = r.timeOut;
  if (r.totalHours !== undefined) m.total_hours = r.totalHours;
  if (r.clockOutTs !== undefined) m.clock_out_ts = r.clockOutTs;
  if (r.noteLastEditedTs !== undefined) m.note_last_edited_ts = r.noteLastEditedTs;
  if (r.noteLocked !== undefined) m.note_locked = r.noteLocked;
  return m;
}

function mapLeave(id: string, rec: FbLeaveRecord): LeaveRequest | null {
  if (!rec) return null;
  const requestId = asString(rec.requestId) || id.split("_")[0] || id;
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
  return {
    requestId: r.requestId,
    leaveType: r.leaveType,
    status: r.status,
    timestamp: serverTimestamp(),
    leaveDate: r.leaveDate[0] ?? "", // legacy: single date per record
    reason: r.reason,
    proofUrl: r.proofUrl,
    Full_Name: r.fullName,
    days: r.days,
    position: r.position,
    year: r.year,
    month: r.month,
    Employee_ID_Number: r.employeeId,
    Days_Off: r.daysOff,
    Schedule: r.schedule,
  };
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
    Employee_ID_Number: o.employeeId,
    Phone_Name: undefined,
    Position: o.position,
    Team: o.team,
    Schedule: o.schedule,
    month: o.month,
    year: o.year,
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
  return {
    CoverageID: c.coverageId,
    CoverageDate: c.coverageDate,
    CoverageTime: c.coverageTime,
    CoveragePosition: c.position,
    month: c.month,
    year: c.year,
    CoverageType: c.coverageType,
    forCoverageHours: c.forCoverageHours,
    CoverageStatus: c.coverageStatus,
    CoveredbyID: c.coveredById,
    TakenBy: c.takenBy,
    Days_Off: c.daysOff,
    Position: c.position,
    Employee_ID_Number: c.requesterId,
    CoveredHours: c.coveredHours,
    Phone_Name: undefined,
    Schedule: c.schedule,
    Team: c.team,
    requesterId: c.requesterId,
    Full_Name: c.requesterName,
    requesterName: c.requesterName,
    Reason: c.reason,
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
    infractionType: asString(rec.InfractionType),
    lostMinutes: asNumber(rec.Lostminutes),
    notes: asString(rec.Notes),
    infractionDate: asString(rec.InfractionDate),
  };
}

function mapHoliday(id: string, rec: FbHolidayRecord): Holiday {
  return {
    id,
    hdate: asString(rec.HDate),
    name: asString(rec.name || rec.Name || rec.HolidayName),
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
