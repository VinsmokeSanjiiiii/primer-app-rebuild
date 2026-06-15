// Single source of truth for all domain models.
// Mirrors the legacy `primer3` Firebase Realtime Database tree — see
// `src/data/repository.ts` for the field-level mapping.

export type LeaveType =
  | "Vacation Leave"
  | "Sick Leave"
  | "Bereavement Leave"
  | "Birthday Leave";

export type LeaveStatus =
  | "Pending"
  | "Approved"
  | "Cancelled"
  | "Declined"
  | "Change Pending";

export type OtType = "OverTime" | "RestDay OverTime";
export type OtShift = "Pre-Shift" | "Post-Shift";
export type OtTypeCode = "PREOT" | "POSTOT" | "RDOT";

export type CoverageStatus =
  | "Available"
  | "Ongoing"
  | "For Approval"
  | "Completed"
  | "Disapproved";

export interface Profile {
  id: string;
  employeeId: string;
  primerEmail: string;
  fullName: string;
  passwordlessAuthEnabled: boolean;
  deviceId?: string;
  publicKey?: string;
  role: string;
  position: string;
  team: string;
  schedule: string;
  daysOff: string;
  status: string;
  dateStarted: string; // ISO date
  tenure: string;
  address: string;
  contactNumber: string;
  personalEmail: string;
  birthDate: string; // ISO date
  department: string;
  phoneName: string;
  vlCredits: number;
  slCredits: number;
  blCredit: number;
  slConversionCredits: number;
  profileImageUrl?: string;
  notes: string;
  philhealth: string;
  sss: string;
  tin: string;
  pagIbig: string;
  workSetup: string;
  isClockedIn: boolean;
  /** 'Flextime' users have different clock rules */
  isFlextime: boolean;
}

export interface AttendanceRecord {
  id: string;
  attendanceCode: string;
  employeeId: string;
  dateIn: string; // M/d/yyyy
  timeIn: string; // HH:mm
  dateOut?: string;
  timeOut?: string;
  totalHours?: number;
  note: string;
  noteLocked: boolean;
  clockOutTs?: number;
  noteLastEditedTs?: number;
  minsLate: number;
  recordType: string;
  status: string;
  isClockedIn: boolean;
  month: string;
  year: number;
}

export interface LeaveRequest {
  id: string;
  requestId: string;
  employeeId: string;
  leaveType: LeaveType;
  leaveDate: string[]; // M/d/yyyy values
  status: LeaveStatus;
  reason: string;
  proofUrl?: string;
  fullName: string;
  days: number;
  position: string;
  year: number;
  month: string;
  daysOff: string;
  schedule: string;
  cancellationReason?: string;
  createdAt: number;
}

export interface OtRequest {
  id: string;
  requestId: string;
  employeeId: string;
  otType: OtType;
  otShift?: OtShift;
  typeCode: OtTypeCode;
  otDate: string; // M/d/yyyy
  otTime: string;
  durationHours: number;
  status: LeaveStatus;
  reason: string;
  fullName: string;
  position: string;
  team: string;
  schedule: string;
  month: string;
  year: number;
  createdAt: number;
  cancellationReason?: string;
}

export interface CoverageRequest {
  id: string;
  coverageId: string;
  employeeId: string; // owner of the coverage record
  requesterId: string;
  requesterName: string;
  coverageDate: string; // M/d/yyyy
  coverageTime: string;
  coverageType: string; // "Tech Issue" | "Leave" | OtTypeCode ...
  coverageStatus: CoverageStatus;
  forCoverageHours: number;
  coveredHours?: number;
  daysOff: string;
  position: string;
  schedule: string;
  month: string;
  year: number;
  team: string;
  reason: string;
  coveredById?: string;
  takenBy?: string;
  createdAt: number;
}

export interface Infraction {
  id: string;
  employeeId: string;
  infractionId?: string;
  infractionType: string;
  lostMinutes: number;
  notes: string;
  infractionDate: string; // M/d/yyyy
  daysOff?: string;
  phoneName?: string;
  schedule?: string;
  driveLink?: string;
  month?: string;
  year?: number;
}

export interface Holiday {
  id: string;
  hdate: string; // M/d/yyyy
  name: string;
}

export interface AppNotification {
  id: string;
  employeeId: string;
  title: string;
  message: string;
  readAt?: number;
  createdAt: number;
}

export type ScreenId =
  | "dashboard"
  | "clock"
  | "attendance"
  | "leave"
  | "ot"
  | "tech"
  | "coverage"
  | "requests"
  | "change-leave"
  | "coverage-records"
  | "infractions"
  | "profile"
  | "notifications";
