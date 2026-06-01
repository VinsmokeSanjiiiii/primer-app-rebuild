/**
 * Repository interface for the PrimerHR data layer.
 *
 * The app consumes this interface exclusively — it never touches a
 * database client directly.  Two implementations exist:
 *
 *  1. LocalRepository  — uses in-memory seed data + localStorage
 *  2. SupabaseRepository — connects to a real Supabase backend
 *
 * The active implementation is chosen at startup based on whether
 * Supabase credentials are present in the environment.
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

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Repository {
  // Auth
  signIn(email: string, password: string): Promise<{ success: boolean; error?: string }>;
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
  deleteCoverageByFilter(filter: { coverageType: string; requesterId: string; coverageStatus: string }): Promise<void>;

  // Infractions
  getInfractions(employeeId: string): Promise<Infraction[]>;

  // Holidays
  getHolidays(): Promise<Holiday[]>;

  // Notifications
  getNotifications(employeeId: string): Promise<AppNotification[]>;
  updateNotification(id: string, patch: Partial<AppNotification>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local (seed) implementation
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

const STORAGE_PREFIX = "primer_repo_";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

export class LocalRepository implements Repository {
  private profile: Profile;
  private attendance: AttendanceRecord[];
  private leaves: LeaveRequest[];
  private otRequests: OtRequest[];
  private coverage: CoverageRequest[];
  private infractions: Infraction[];
  private holidays: Holiday[];
  private notifications: AppNotification[];

  constructor() {
    this.profile = load("profile", seedProfile);
    this.attendance = load("attendance", seedAttendance);
    this.leaves = load("leaves", seedLeaves);
    this.otRequests = load("ot", seedOt);
    this.coverage = load("coverage", seedCoverage);
    this.infractions = load("infractions", seedInfractions);
    this.holidays = load("holidays", seedHolidays);
    this.notifications = load("notifications", seedNotifications);
  }

  private persist() {
    save("profile", this.profile);
    save("attendance", this.attendance);
    save("leaves", this.leaves);
    save("ot", this.otRequests);
    save("coverage", this.coverage);
    save("notifications", this.notifications);
  }

  // Auth — simulated
  async signIn(_email: string, _password: string) {
    return { success: true };
  }
  async signOut() { /* no-op */ }
  async getSession() {
    return null; // session managed by store's localStorage
  }

  // Profile
  async getProfile(_employeeId: string) {
    return this.profile;
  }
  async updateProfile(_employeeId: string, patch: Partial<Profile>) {
    this.profile = { ...this.profile, ...patch };
    this.persist();
  }

  // Attendance
  async getAttendance(_employeeId: string) {
    return this.attendance;
  }
  async createAttendance(record: AttendanceRecord) {
    this.attendance = [record, ...this.attendance];
    this.persist();
  }
  async updateAttendance(id: string, patch: Partial<AttendanceRecord>) {
    this.attendance = this.attendance.map((r) =>
      r.id === id ? { ...r, ...patch } : r,
    );
    this.persist();
  }

  // Leave
  async getLeaves(_employeeId: string) {
    return this.leaves;
  }
  async createLeave(request: LeaveRequest) {
    this.leaves = [request, ...this.leaves];
    this.persist();
  }
  async updateLeave(id: string, patch: Partial<LeaveRequest>) {
    this.leaves = this.leaves.map((l) =>
      l.id === id ? { ...l, ...patch } : l,
    );
    this.persist();
  }

  // OT
  async getOtRequests(_employeeId: string) {
    return this.otRequests;
  }
  async createOtRequest(request: OtRequest) {
    this.otRequests = [request, ...this.otRequests];
    this.persist();
  }
  async updateOtRequest(id: string, patch: Partial<OtRequest>) {
    this.otRequests = this.otRequests.map((o) =>
      o.id === id ? { ...o, ...patch } : o,
    );
    this.persist();
  }

  // Coverage
  async getCoverage() {
    return this.coverage;
  }
  async createCoverage(request: CoverageRequest) {
    this.coverage = [request, ...this.coverage];
    this.persist();
  }
  async updateCoverage(id: string, patch: Partial<CoverageRequest>) {
    this.coverage = this.coverage.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    );
    this.persist();
  }
  async deleteCoverageByFilter(filter: { coverageType: string; requesterId: string; coverageStatus: string }) {
    this.coverage = this.coverage.filter(
      (c) =>
        !(c.coverageType === filter.coverageType &&
          c.requesterId === filter.requesterId &&
          c.coverageStatus === filter.coverageStatus),
    );
    this.persist();
  }

  // Read-only
  async getInfractions(_employeeId: string) {
    return this.infractions;
  }
  async getHolidays() {
    return this.holidays;
  }

  // Notifications
  async getNotifications(_employeeId: string) {
    return this.notifications;
  }
  async updateNotification(id: string, patch: Partial<AppNotification>) {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    );
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Supabase implementation (stub — ready for real queries)
// ---------------------------------------------------------------------------

import { getSupabase } from "./supabase";

export class SupabaseRepository implements Repository {
  private get db() {
    const client = getSupabase();
    if (!client) throw new Error("Supabase not configured");
    return client;
  }

  async signIn(email: string, password: string) {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
  async signOut() {
    await this.db.auth.signOut();
  }
  async getSession() {
    const { data } = await this.db.auth.getSession();
    if (!data.session) return null;
    // UNKNOWN: exact mapping of auth user to employee profile.
    // Assumed: employee_id stored in user_metadata or a profiles join.
    return {
      employeeId: data.session.user.user_metadata?.employee_id ?? "",
      email: data.session.user.email ?? "",
    };
  }

  // Profile
  async getProfile(employeeId: string) {
    const { data } = await this.db
      .from("profiles")
      .select("*")
      .eq("employee_id", employeeId)
      .single();
    return data ? mapProfileFromDb(data) : null;
  }
  async updateProfile(employeeId: string, patch: Partial<Profile>) {
    await this.db
      .from("profiles")
      .update(mapProfileToDb(patch))
      .eq("employee_id", employeeId);
  }

  // Attendance
  async getAttendance(employeeId: string) {
    const { data } = await this.db
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapAttendanceFromDb);
  }
  async createAttendance(record: AttendanceRecord) {
    await this.db.from("attendance_records").insert(mapAttendanceToDb(record));
  }
  async updateAttendance(id: string, patch: Partial<AttendanceRecord>) {
    await this.db.from("attendance_records").update(mapAttendanceToDb(patch)).eq("id", id);
  }

  // Leave
  async getLeaves(employeeId: string) {
    const { data } = await this.db
      .from("leave_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapLeaveFromDb);
  }
  async createLeave(request: LeaveRequest) {
    await this.db.from("leave_requests").insert(mapLeaveToDb(request));
  }
  async updateLeave(id: string, patch: Partial<LeaveRequest>) {
    await this.db.from("leave_requests").update(mapLeaveToDb(patch)).eq("id", id);
  }

  // OT
  async getOtRequests(employeeId: string) {
    const { data } = await this.db
      .from("ot_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapOtFromDb);
  }
  async createOtRequest(request: OtRequest) {
    await this.db.from("ot_requests").insert(mapOtToDb(request));
  }
  async updateOtRequest(id: string, patch: Partial<OtRequest>) {
    await this.db.from("ot_requests").update(mapOtToDb(patch)).eq("id", id);
  }

  // Coverage
  async getCoverage() {
    const { data } = await this.db
      .from("coverage_requests")
      .select("*")
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapCoverageFromDb);
  }
  async createCoverage(request: CoverageRequest) {
    await this.db.from("coverage_requests").insert(mapCoverageToDb(request));
  }
  async updateCoverage(id: string, patch: Partial<CoverageRequest>) {
    await this.db.from("coverage_requests").update(mapCoverageToDb(patch)).eq("id", id);
  }
  async deleteCoverageByFilter(filter: { coverageType: string; requesterId: string; coverageStatus: string }) {
    await this.db
      .from("coverage_requests")
      .delete()
      .eq("coverage_type", filter.coverageType)
      .eq("requester_id", filter.requesterId)
      .eq("coverage_status", filter.coverageStatus);
  }

  // Read-only
  async getInfractions(employeeId: string) {
    const { data } = await this.db
      .from("infractions")
      .select("*")
      .eq("employee_id", employeeId);
    return (data ?? []).map(mapInfractionFromDb);
  }
  async getHolidays() {
    const { data } = await this.db.from("holidays").select("*");
    return (data ?? []).map(mapHolidayFromDb);
  }

  // Notifications
  async getNotifications(employeeId: string) {
    const { data } = await this.db
      .from("notifications")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapNotificationFromDb);
  }
  async updateNotification(id: string, patch: Partial<AppNotification>) {
    await this.db
      .from("notifications")
      .update({ read_at: patch.readAt ? new Date(patch.readAt).toISOString() : null })
      .eq("id", id);
  }
}

// ---------------------------------------------------------------------------
// DB ↔ App model mappers (snake_case ↔ camelCase)
//
// UNKNOWN: Exact Supabase column names. These mappers assume the schema
// documented in README and can be adjusted when the real schema is finalized.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProfileFromDb(row: any): Profile {
  return {
    id: row.id,
    employeeId: row.employee_id,
    primerEmail: row.primer_email ?? "",
    fullName: row.full_name ?? "",
    passwordlessAuthEnabled: row.passwordless_auth_enabled ?? false,
    deviceId: row.device_id,
    publicKey: row.public_key,
    role: row.role ?? "",
    position: row.position ?? "",
    team: row.team ?? "",
    schedule: row.schedule ?? "",
    daysOff: row.days_off ?? "",
    status: row.status ?? "",
    dateStarted: row.date_started ?? "",
    tenure: row.tenure ?? "",
    address: row.address ?? "",
    contactNumber: row.contact_number ?? "",
    personalEmail: row.personal_email ?? "",
    birthDate: row.birth_date ?? "",
    department: row.department ?? "",
    phoneName: row.phone_name ?? "",
    vlCredits: row.vl_credits ?? 0,
    slCredits: row.sl_credits ?? 0,
    blCredit: row.bl_credit ?? 0,
    slConversionCredits: row.sl_conversion_credits ?? 0,
    profileImageUrl: row.profile_image_url,
    notes: row.notes ?? "",
    philhealth: row.philhealth ?? "",
    sss: row.sss ?? "",
    tin: row.tin ?? "",
    pagIbig: row.pag_ibig ?? "",
    workSetup: row.work_setup ?? "",
    isClockedIn: row.is_clocked_in ?? false,
  };
}

function mapProfileToDb(p: Partial<Profile>): Record<string, any> {
  const m: Record<string, any> = {};
  if (p.fullName !== undefined) m.full_name = p.fullName;
  if (p.notes !== undefined) m.notes = p.notes;
  if (p.profileImageUrl !== undefined) m.profile_image_url = p.profileImageUrl;
  if (p.vlCredits !== undefined) m.vl_credits = p.vlCredits;
  if (p.slCredits !== undefined) m.sl_credits = p.slCredits;
  if (p.blCredit !== undefined) m.bl_credit = p.blCredit;
  if (p.slConversionCredits !== undefined) m.sl_conversion_credits = p.slConversionCredits;
  if (p.isClockedIn !== undefined) m.is_clocked_in = p.isClockedIn;
  if (p.philhealth !== undefined) m.philhealth = p.philhealth;
  if (p.sss !== undefined) m.sss = p.sss;
  if (p.tin !== undefined) m.tin = p.tin;
  if (p.pagIbig !== undefined) m.pag_ibig = p.pagIbig;
  return m;
}

function mapAttendanceFromDb(row: any): AttendanceRecord {
  return {
    id: row.id,
    attendanceCode: row.attendance_code ?? "",
    employeeId: row.employee_id,
    dateIn: row.date_in ?? "",
    timeIn: row.time_in ?? "",
    dateOut: row.date_out,
    timeOut: row.time_out,
    totalHours: row.total_hours,
    note: row.note ?? "",
    noteLocked: row.note_locked ?? false,
    clockOutTs: row.clock_out_ts,
    noteLastEditedTs: row.note_last_edited_ts,
    minsLate: row.mins_late ?? 0,
    recordType: row.record_type ?? "Regular",
    status: row.status ?? "",
    isClockedIn: row.is_clocked_in ?? false,
    month: row.month ?? "",
    year: row.year ?? new Date().getFullYear(),
  };
}
function mapAttendanceToDb(r: Partial<AttendanceRecord>): Record<string, any> {
  const m: Record<string, any> = {};
  if (r.id !== undefined) m.id = r.id;
  if (r.attendanceCode !== undefined) m.attendance_code = r.attendanceCode;
  if (r.employeeId !== undefined) m.employee_id = r.employeeId;
  if (r.dateIn !== undefined) m.date_in = r.dateIn;
  if (r.timeIn !== undefined) m.time_in = r.timeIn;
  if (r.dateOut !== undefined) m.date_out = r.dateOut;
  if (r.timeOut !== undefined) m.time_out = r.timeOut;
  if (r.totalHours !== undefined) m.total_hours = r.totalHours;
  if (r.note !== undefined) m.note = r.note;
  if (r.noteLocked !== undefined) m.note_locked = r.noteLocked;
  if (r.clockOutTs !== undefined) m.clock_out_ts = r.clockOutTs;
  if (r.noteLastEditedTs !== undefined) m.note_last_edited_ts = r.noteLastEditedTs;
  if (r.status !== undefined) m.status = r.status;
  if (r.isClockedIn !== undefined) m.is_clocked_in = r.isClockedIn;
  if (r.month !== undefined) m.month = r.month;
  if (r.year !== undefined) m.year = r.year;
  return m;
}

function mapLeaveFromDb(row: any): LeaveRequest {
  return {
    id: row.id,
    requestId: row.request_id ?? "",
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    leaveDate: Array.isArray(row.leave_date) ? row.leave_date : [row.leave_date],
    status: row.status,
    reason: row.reason ?? "",
    proofUrl: row.proof_url,
    fullName: row.full_name ?? "",
    days: row.days ?? 1,
    position: row.position ?? "",
    year: row.year ?? new Date().getFullYear(),
    month: row.month ?? "",
    daysOff: row.days_off ?? "",
    schedule: row.schedule ?? "",
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
function mapLeaveToDb(l: Partial<LeaveRequest>): Record<string, any> {
  const m: Record<string, any> = {};
  if (l.id !== undefined) m.id = l.id;
  if (l.requestId !== undefined) m.request_id = l.requestId;
  if (l.employeeId !== undefined) m.employee_id = l.employeeId;
  if (l.leaveType !== undefined) m.leave_type = l.leaveType;
  if (l.leaveDate !== undefined) m.leave_date = l.leaveDate;
  if (l.status !== undefined) m.status = l.status;
  if (l.reason !== undefined) m.reason = l.reason;
  if (l.fullName !== undefined) m.full_name = l.fullName;
  if (l.days !== undefined) m.days = l.days;
  if (l.position !== undefined) m.position = l.position;
  if (l.year !== undefined) m.year = l.year;
  if (l.month !== undefined) m.month = l.month;
  if (l.daysOff !== undefined) m.days_off = l.daysOff;
  if (l.schedule !== undefined) m.schedule = l.schedule;
  if (l.cancellationReason !== undefined) m.cancellation_reason = l.cancellationReason;
  return m;
}

function mapOtFromDb(row: any): OtRequest {
  return {
    id: row.id,
    requestId: row.request_id ?? "",
    employeeId: row.employee_id,
    otType: row.ot_type,
    otShift: row.ot_shift,
    typeCode: row.type_code ?? row.ot_type_code ?? "POSTOT",
    otDate: row.ot_date ?? "",
    otTime: row.ot_time ?? "",
    durationHours: row.duration_hours ?? row.ot_duration ?? 1,
    status: row.status,
    reason: row.reason ?? "",
    fullName: row.full_name ?? "",
    position: row.position ?? "",
    team: row.team ?? "",
    schedule: row.schedule ?? "",
    month: row.month ?? "",
    year: row.year ?? new Date().getFullYear(),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    cancellationReason: row.cancellation_reason,
  };
}
function mapOtToDb(o: Partial<OtRequest>): Record<string, any> {
  const m: Record<string, any> = {};
  if (o.id !== undefined) m.id = o.id;
  if (o.requestId !== undefined) m.request_id = o.requestId;
  if (o.employeeId !== undefined) m.employee_id = o.employeeId;
  if (o.otType !== undefined) m.ot_type = o.otType;
  if (o.otShift !== undefined) m.ot_shift = o.otShift;
  if (o.typeCode !== undefined) m.type_code = o.typeCode;
  if (o.otDate !== undefined) m.ot_date = o.otDate;
  if (o.otTime !== undefined) m.ot_time = o.otTime;
  if (o.durationHours !== undefined) m.duration_hours = o.durationHours;
  if (o.status !== undefined) m.status = o.status;
  if (o.reason !== undefined) m.reason = o.reason;
  if (o.fullName !== undefined) m.full_name = o.fullName;
  if (o.cancellationReason !== undefined) m.cancellation_reason = o.cancellationReason;
  return m;
}

function mapCoverageFromDb(row: any): CoverageRequest {
  return {
    id: row.id,
    coverageId: row.coverage_id ?? "",
    employeeId: row.employee_id,
    requesterId: row.requester_id ?? "",
    requesterName: row.requester_name ?? "",
    coverageDate: row.coverage_date ?? "",
    coverageTime: row.coverage_time ?? "",
    coverageType: row.coverage_type ?? "",
    coverageStatus: row.coverage_status ?? "Available",
    forCoverageHours: row.for_coverage_hours ?? 0,
    coveredHours: row.covered_hours,
    daysOff: row.days_off ?? "",
    position: row.position ?? "",
    schedule: row.schedule ?? "",
    month: row.month ?? "",
    year: row.year ?? new Date().getFullYear(),
    team: row.team ?? "",
    reason: row.reason ?? "",
    coveredById: row.coveredby_id,
    takenBy: row.taken_by,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
function mapCoverageToDb(c: Partial<CoverageRequest>): Record<string, any> {
  const m: Record<string, any> = {};
  if (c.id !== undefined) m.id = c.id;
  if (c.coverageId !== undefined) m.coverage_id = c.coverageId;
  if (c.employeeId !== undefined) m.employee_id = c.employeeId;
  if (c.requesterId !== undefined) m.requester_id = c.requesterId;
  if (c.requesterName !== undefined) m.requester_name = c.requesterName;
  if (c.coverageDate !== undefined) m.coverage_date = c.coverageDate;
  if (c.coverageTime !== undefined) m.coverage_time = c.coverageTime;
  if (c.coverageType !== undefined) m.coverage_type = c.coverageType;
  if (c.coverageStatus !== undefined) m.coverage_status = c.coverageStatus;
  if (c.forCoverageHours !== undefined) m.for_coverage_hours = c.forCoverageHours;
  if (c.coveredHours !== undefined) m.covered_hours = c.coveredHours;
  if (c.coveredById !== undefined) m.coveredby_id = c.coveredById;
  if (c.takenBy !== undefined) m.taken_by = c.takenBy;
  if (c.reason !== undefined) m.reason = c.reason;
  return m;
}

function mapInfractionFromDb(row: any): Infraction {
  return {
    id: row.id,
    employeeId: row.employee_id,
    infractionType: row.infraction_type ?? "",
    lostMinutes: row.lost_minutes ?? 0,
    notes: row.notes ?? "",
    infractionDate: row.infraction_date ?? "",
  };
}

function mapHolidayFromDb(row: any): Holiday {
  return {
    id: row.id,
    hdate: row.hdate ?? "",
    name: row.name ?? "",
  };
}

function mapNotificationFromDb(row: any): AppNotification {
  return {
    id: row.id,
    employeeId: row.employee_id,
    title: row.title ?? "",
    message: row.message ?? "",
    readAt: row.read_at ? new Date(row.read_at).getTime() : undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

import { isSupabaseConfigured } from "./supabase";

let _instance: Repository | null = null;

export function getRepository(): Repository {
  if (!_instance) {
    _instance = isSupabaseConfigured()
      ? new SupabaseRepository()
      : new LocalRepository();
  }
  return _instance;
}
