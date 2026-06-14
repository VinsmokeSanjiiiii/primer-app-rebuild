/**
 * Centralized calendar validation utilities for Primer Communications.
 *
 * These functions enforce the original application's date selection rules
 * across leave requests, OT requests, tech coverage, and date changes.
 */
import { parseDate, startOfDay, serverNow, daysBetween, fmtDate } from "./date";
import { WEEKDAYS } from "./date";
import type { Holiday } from "../types";

export interface CalendarValidationContext {
  /** Today's date (server time anchored) */
  today: Date;
  /** User's days off as string (e.g., "Saturday, Sunday") */
  daysOff: string;
  /** Holiday dates in M/d/yyyy format */
  holidays: string[];
  /** Already requested dates in M/d/yyyy format */
  requestedDates: string[];
  /** Maximum consecutive days allowed (default 3 for leave) */
  maxConsecutiveDays?: number;
  /** Whether future dates are allowed */
  allowFutureDates?: boolean;
  /** Whether past dates are allowed */
  allowPastDates?: boolean;
  /** Whether birthday leave is being selected */
  isBirthdayLeave?: boolean;
  /** User's birthday date */
  birthdayDate?: Date;
  /** Birthday leave minimum days before rule */
  birthdayMinDaysBefore?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Parse days off string into a Set of day indices (0 = Sunday, 6 = Saturday).
 */
export function parseDaysOff(daysOff: string): Set<number> {
  const set = new Set<number>();
  daysOff.split(/[,/]/).forEach((d) => {
    const trimmed = d.trim().toLowerCase();
    // Match partial names like "Sat" or "Saturday"
    const fullDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const shortDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    const fullIdx = fullDays.findIndex((w) => trimmed === w);
    if (fullIdx >= 0) {
      set.add(fullIdx);
      return;
    }

    const shortIdx = shortDays.findIndex((w) => trimmed.startsWith(w));
    if (shortIdx >= 0) {
      set.add(shortIdx);
      return;
    }

    // Also check WEEKDAYS array
    const weekdayIdx = WEEKDAYS.findIndex((w) => trimmed.startsWith(w.toLowerCase()));
    if (weekdayIdx >= 0) {
      set.add(weekdayIdx);
    }
  });
  return set;
}

/**
 * Check if a date falls on a weekend or configured day off.
 */
export function isDayOff(date: Date, daysOffSet: Set<number>): boolean {
  return daysOffSet.has(date.getDay());
}

/**
 * Check if a date is a holiday.
 */
export function isHoliday(date: Date, holidays: string[]): boolean {
  const ds = fmtDate(date);
  return holidays.includes(ds);
}

/**
 * Check if a date has already been requested.
 */
export function isAlreadyRequested(date: Date, requestedDates: string[]): boolean {
  const ds = fmtDate(date);
  return requestedDates.includes(ds);
}

/**
 * Validate a single date selection according to business rules.
 */
export function validateDateSelection(
  date: Date,
  ctx: CalendarValidationContext,
): ValidationResult {
  const today = startOfDay(ctx.today);
  const d = startOfDay(date);

  // Past date check
  if (!ctx.allowPastDates && d < today) {
    return { valid: false, reason: "Past dates are not allowed." };
  }

  // Future date check
  if (!ctx.allowFutureDates && d > today) {
    return { valid: false, reason: "Future dates are not allowed." };
  }

  // Day off check (only for certain request types)
  const daysOffSet = parseDaysOff(ctx.daysOff);
  if (isDayOff(date, daysOffSet)) {
    return { valid: false, reason: "This is your day off." };
  }

  // Holiday check
  if (isHoliday(date, ctx.holidays)) {
    return { valid: false, reason: "This is a holiday." };
  }

  // Already requested check
  if (isAlreadyRequested(date, ctx.requestedDates)) {
    return { valid: false, reason: "Already requested." };
  }

  // Birthday leave specific validation
  if (ctx.isBirthdayLeave && ctx.birthdayDate) {
    // Must be the actual birthday date
    if (date.getMonth() !== ctx.birthdayDate.getMonth() ||
        date.getDate() !== ctx.birthdayDate.getDate()) {
      return { valid: false, reason: "Birthday leave must be on your birthday date." };
    }

    // Check minimum days before rule (default 15 days)
    const minDays = ctx.birthdayMinDaysBefore ?? 15;
    if (daysBetween(today, ctx.birthdayDate) < minDays) {
      return {
        valid: false,
        reason: `Birthday leave cannot be requested within ${minDays} days of your birthday.`,
      };
    }

    // Birthday already passed this year
    if (ctx.birthdayDate < today) {
      return { valid: false, reason: "Your birthday has already passed this year." };
    }
  }

  return { valid: true };
}

/**
 * Validate a range of consecutive dates.
 * Returns the first invalid date, or null if all valid.
 */
export function validateDateRange(
  dates: Date[],
  ctx: CalendarValidationContext,
): { valid: boolean; invalidDate?: Date; reason?: string } {
  if (dates.length === 0) {
    return { valid: true };
  }

  // Sort dates
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

  // Check each date individually
  for (const date of sorted) {
    const result = validateDateSelection(date, ctx);
    if (!result.valid) {
      return { valid: false, invalidDate: date, reason: result.reason };
    }
  }

  // Check consecutive days constraint
  const maxDays = ctx.maxConsecutiveDays ?? 3;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanDays = daysBetween(first, last) + 1;

  if (sorted.length > maxDays) {
    return {
      valid: false,
      reason: `Maximum ${maxDays} consecutive days allowed per request.`,
    };
  }

  if (spanDays > maxDays) {
    return {
      valid: false,
      reason: `Selected dates must be within ${maxDays} consecutive days.`,
    };
  }

  // Check no gaps in selection (for leave requests)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = daysBetween(prev, curr);
    if (gap > 1) {
      return {
        valid: false,
        reason: "Leave dates must be consecutive (no gaps).",
      };
    }
  }

  return { valid: true };
}

/**
 * Create a disabledReason function for use with Calendar component.
 */
export function createDisabledReasonFn(
  ctx: Omit<CalendarValidationContext, "today">,
): (date: Date) => string | null {
  const today = startOfDay(serverNow());
  const fullCtx = { ...ctx, today };

  return (date: Date) => {
    const result = validateDateSelection(date, fullCtx);
    return result.valid ? null : (result.reason ?? "Not available");
  };
}

export type { Holiday };
