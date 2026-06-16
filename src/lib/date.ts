// Centralized date utilities. The legacy app standardizes on Asia/Manila and
// the M/d/yyyy date format with HH:mm time. Server time is always trusted over
// device time.
//
// ALL formatting uses Intl.DateTimeFormat with timeZone: "Asia/Manila" so the
// displayed times are correct regardless of the user's device timezone setting.

export const TIMEZONE = "Asia/Manila";

let _serverOffsetMs = 0;

export function setServerTimeOffsetMs(offsetMs: number): void {
  _serverOffsetMs = offsetMs;
}

export function getServerTimeOffsetMs(): number {
  return _serverOffsetMs;
}

/**
 * Format a Date as M/d/yyyy in Asia/Manila timezone (no leading zeros).
 * This is the legacy primary format used throughout the app.
 */
export function fmtDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p.month}/${p.day}/${p.year}`;
}

/**
 * Format a Date as HH:mm (24h) in Asia/Manila timezone.
 */
export function fmtTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  // hour12:false may return "24" at midnight in some runtimes; normalise to "00"
  const h = p.hour === "24" ? "00" : (p.hour ?? "00");
  return `${h}:${p.minute ?? "00"}`;
}

/** Parse a M/d/yyyy (or "M/d/yyyy HH:mm:ss …") string back to a Date at local midnight. */
export function parseDate(s: string): Date {
  const datePart = s.split(" ")[0]; // drop any time component
  const [m, d, y] = datePart.split("/").map(Number);
  if (!y || isNaN(y)) return new Date(0);
  return new Date(y, m - 1, d);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month name (long) for a Date in Asia/Manila timezone. */
export function monthName(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "long",
  }).format(d);
}

/** Full numeric year in Asia/Manila timezone. */
export function phtYear(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric" }).format(d),
  );
}

/**
 * Server-anchored "now" timestamp.
 *
 * Returns a Date whose .getTime() is aligned with the Firebase RTDB server
 * clock (via the cached /.info/serverTimeOffset offset).  Use fmtDate /
 * fmtTime to display it in Asia/Manila; do NOT rely on .getHours() etc.
 * which depend on the local device timezone.
 */
export function serverNow(): Date {
  return new Date(Date.now() + _serverOffsetMs);
}

export function serverNowMs(): number {
  return Date.now() + _serverOffsetMs;
}

/** Whether device time deviates from server time beyond the safe threshold. */
export function deviceTimeIsSafe(thresholdMinutes = 5): boolean {
  const skewMs = Math.abs(_serverOffsetMs);
  return skewMs <= thresholdMinutes * 60 * 1000;
}

/** Current month name (long) based on server time in Asia/Manila. e.g. "June" */
export function currentServerMonth(): string {
  return monthName(serverNow());
}

/** Current 4-digit year based on server time in Asia/Manila. */
export function currentServerYear(): number {
  return phtYear(serverNow());
}

/** Same calendar day (local timezone comparison, fine for date range filters). */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Build the grid of dates for a calendar month (with leading/trailing nulls). */
export function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Compute total hours between a clock-in and clock-out using string-parsed dates.
 * Prefer using Unix-ms timestamps (clockInTs) when available for precision.
 */
export function computeTotalHours(
  dateIn: string,
  timeIn: string,
  dateOut: string,
  timeOut: string,
): number {
  const a = combine(dateIn, timeIn);
  const b = combine(dateOut, timeOut);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / 3.6e6) * 100) / 100);
}

function combine(dateStr: string, timeStr: string): Date {
  const d = parseDate(dateStr);
  const parts = timeStr.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  if (isNaN(h) || isNaN(m)) return new Date(NaN);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Attendance note lock threshold: 6 hours after clock-out (server time). */
export const NOTE_LOCK_HOURS = 6;

export function noteIsLocked(rec: {
  noteLocked: boolean;
  clockOutTs?: number;
}): boolean {
  if (rec.noteLocked) return true;
  if (!rec.clockOutTs) return false;
  const elapsed = serverNow().getTime() - rec.clockOutTs;
  return elapsed > NOTE_LOCK_HOURS * 60 * 60 * 1000;
}

export function tenureFrom(dateStarted: string): string {
  const start = new Date(dateStarted);
  const now = serverNow();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  parts.push(`${rem} mo${rem !== 1 ? "s" : ""}`);
  return parts.join(" ");
}
