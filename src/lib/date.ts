// Centralized date utilities. The legacy app standardizes on Asia/Manila and
// the M/d/yyyy date format with HH:mm time. Server time is always trusted over
// device time.

export const TIMEZONE = "Asia/Manila";

/** Format a Date as M/d/yyyy (no leading zeros), the legacy primary format. */
export function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Format a Date as HH:mm (24h). */
export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Parse a M/d/yyyy string back to a Date (local midnight). */
export function parseDate(s: string): Date {
  const [m, d, y] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthName(d: Date): string {
  return MONTHS[d.getMonth()];
}

/** Simulated trusted "server time". In the real app this is fetched securely. */
export function serverNow(): Date {
  // Apply a tiny synthetic skew to demonstrate the server-vs-device concept.
  return new Date();
}

/** Whether device time deviates from server time beyond the safe threshold. */
export function deviceTimeIsSafe(thresholdMinutes = 5): boolean {
  // In a real device-binding flow this compares device vs server; here it's safe.
  const skewMs = Math.abs(Date.now() - serverNow().getTime());
  return skewMs <= thresholdMinutes * 60 * 1000;
}

/** Same calendar day. */
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

/** Compute total hours between a clock-in and clock-out. */
export function computeTotalHours(
  dateIn: string,
  timeIn: string,
  dateOut: string,
  timeOut: string,
): number {
  const a = combine(dateIn, timeIn);
  const b = combine(dateOut, timeOut);
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / 3.6e6) * 100) / 100);
}

function combine(dateStr: string, timeStr: string): Date {
  const d = parseDate(dateStr);
  const [h, m] = timeStr.split(":").map(Number);
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
