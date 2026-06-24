import { fmtDate, parseDate, WEEKDAYS } from "./date";
import type { LeaveRequest } from "../types";

export const MAX_PER_REQUEST = 3;
export const MAX_CONSECUTIVE_BLOCK = 5;

/** Parse a "SAT-SUN" / "Sat, Sun" / "saturday,sunday" string into JS getDay() indices (0=Sun). */
export function parseDaysOff(daysOff: string): Set<number> {
  const set = new Set<number>();
  if (!daysOff) return set;
  // Split by common separators and also expand RANGES like "MON-FRI".
  const tokens = daysOff
    .split(/[,/]/)
    .flatMap((part) => {
      const range = part.split("-").map((t) => t.trim()).filter(Boolean);
      if (range.length === 2) {
        const a = dayNameToIdx(range[0]);
        const b = dayNameToIdx(range[1]);
        if (a >= 0 && b >= 0) {
          const out: number[] = [];
          let i = a;
          // walk forward, wrapping through the week, until we hit b
          for (let safety = 0; safety < 8; safety++) {
            out.push(i);
            if (i === b) break;
            i = (i + 1) % 7;
          }
          return out.map(String);
        }
      }
      return [part];
    });

  for (const raw of tokens) {
    const i = dayNameToIdx(raw);
    if (i >= 0) set.add(i);
  }
  return set;
}

function dayNameToIdx(s: string): number {
  const t = s.trim().toLowerCase();
  if (!t) return -1;
  // numeric token from range expansion
  if (/^\d$/.test(t)) return Number(t);
  const short = WEEKDAYS.findIndex((w) => t.startsWith(w.toLowerCase()));
  if (short >= 0) return short;
  const long = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].findIndex(
    (w) => w === t,
  );
  return long;
}

export interface BlockContext {
  /** All existing leaves (any status). */
  leaves: LeaveRequest[];
  /** Weekday indices the user is off (0=Sun..6=Sat). */
  dayOffIdx: Set<number>;
  /** Holiday dates (M/d/yyyy). */
  holidays: Set<string>;
  /** Dates currently selected in the in-progress request (M/d/yyyy). */
  currentSelection?: string[];
  /** Optional: id of a leave currently being edited (excluded from "committed"). */
  excludeLeaveId?: string;
}

/** True if a calendar day is non-working (day off or holiday) for the user. */
export function isNonWorkingDay(d: Date, dayOffIdx: Set<number>, holidays: Set<string>): boolean {
  if (dayOffIdx.has(d.getDay())) return true;
  if (holidays.has(fmtDate(d))) return true;
  return false;
}

/** Returns the set of dates "committed" by existing requests (Approved + Pending only). */
export function committedLeaveDates(leaves: LeaveRequest[], excludeId?: string): Set<string> {
  const set = new Set<string>();
  for (const l of leaves) {
    if (excludeId && l.id === excludeId) continue;
    if (l.status !== "Approved" && l.status !== "Pending") continue;
    for (const d of l.leaveDate) set.add(d);
  }
  return set;
}

/** Length of the consecutive run that the given date belongs to, where steps continue
 *  through committed leave dates, day-off weekdays, and holidays. */
export function consecutiveRunLength(
  date: Date,
  committed: Set<string>,
  dayOffIdx: Set<number>,
  holidays: Set<string>,
): number {
  const continues = (d: Date) =>
    committed.has(fmtDate(d)) || dayOffIdx.has(d.getDay()) || holidays.has(fmtDate(d));

  if (!continues(date)) return 0;
  let length = 1;

  const left = new Date(date);
  for (;;) {
    left.setDate(left.getDate() - 1);
    if (!continues(left)) break;
    length++;
    if (length > 99) break;
  }
  const right = new Date(date);
  for (;;) {
    right.setDate(right.getDate() + 1);
    if (!continues(right)) break;
    length++;
    if (length > 99) break;
  }
  return length;
}

/** Returns true if adding `candidate` to the current draft would push any
 *  consecutive run over the MAX_CONSECUTIVE_BLOCK cap. */
export function wouldExceedCap(candidate: Date, ctx: BlockContext): boolean {
  const committed = committedLeaveDates(ctx.leaves, ctx.excludeLeaveId);
  for (const ds of ctx.currentSelection ?? []) committed.add(ds);
  committed.add(fmtDate(candidate));
  const len = consecutiveRunLength(candidate, committed, ctx.dayOffIdx, ctx.holidays);
  return len > MAX_CONSECUTIVE_BLOCK;
}

/** Validate a complete selection (used at submit-time and on every toggle).
 *  Returns null if valid, or an error message. */
export function validateSelection(
  selection: string[],
  leaves: LeaveRequest[],
  dayOffIdx: Set<number>,
  holidays: Set<string>,
  excludeId?: string,
): string | null {
  if (selection.length === 0) return null;
  if (selection.length > MAX_PER_REQUEST) {
    return `Maximum ${MAX_PER_REQUEST} days per leave request.`;
  }
  // Single-request consecutive window check (within the picked dates)
  const sorted = [...selection].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());
  const first = parseDate(sorted[0]);
  const last = parseDate(sorted[sorted.length - 1]);
  const span = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  if (span > MAX_PER_REQUEST) {
    return `Selected dates must be within ${MAX_PER_REQUEST} consecutive days.`;
  }

  // Combined run with existing leaves + days off + holidays must stay ≤ 5
  const committed = committedLeaveDates(leaves, excludeId);
  for (const ds of selection) committed.add(ds);
  for (const ds of selection) {
    const len = consecutiveRunLength(parseDate(ds), committed, dayOffIdx, holidays);
    if (len > MAX_CONSECUTIVE_BLOCK) {
      return `Total consecutive leave days cannot exceed ${MAX_CONSECUTIVE_BLOCK} (Days off and holidays count).`;
    }
  }
  return null;
}
