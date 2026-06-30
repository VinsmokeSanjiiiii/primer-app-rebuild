// ---------------------------------------------------------------------------
// Immutable audit log writer (Feature 5)
// ---------------------------------------------------------------------------
// Appends structured entries to Firebase /AuditLog/{year}/{month} using
// push() so each entry gets a unique, time-ordered key.
//
// Entries are NEVER updated or deleted from the client.
// NEVER log secrets, OTPs, tokens, or passwords here.
//
// Audit writes are fire-and-forget: failures are console-warned but
// never throw to callers — audit must never block business operations.
// ---------------------------------------------------------------------------

import { ref, push, serverTimestamp } from "firebase/database";
import { getDb, isFirebaseConfigured } from "../data/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  | "clock_in"
  | "clock_out"
  | "leave_submitted"
  | "leave_cancelled"
  | "leave_date_changed"
  | "ot_submitted"
  | "ot_cancelled"
  | "ot_date_changed"
  | "coverage_grabbed"
  | "coverage_cancelled"
  | "coverage_finished"
  | "coverage_submitted"
  | "profile_updated"
  | "password_reset_requested"
  | "password_reset_verified"
  | "password_reset_completed"
  | "sign_in"
  | "sign_in_failed"
  | "sign_out"
  | "write_queue_permanent_failure";

export interface AuditEntry {
  /** Employee who performed the action. */
  actorId: string;
  actorName?: string;
  /** What happened. */
  action: AuditAction;
  /** ID of the primary resource affected. */
  targetId?: string;
  /** Human-readable description of what was affected. */
  target: string;
  /** Before-state (no secrets). Omit if unavailable. */
  before?: Record<string, unknown>;
  /** After-state (no secrets). Omit if unavailable. */
  after?: Record<string, unknown>;
  /** Firebase server timestamp — set by Firebase, not the client. */
  _serverTs?: ReturnType<typeof serverTimestamp>;
  /** Client-side timestamp in ms (fallback + ordering). */
  clientTimestampMs: number;
  /** Correlation ID linking this audit entry to a telemetry record. */
  correlationId?: string;
  /** Outcome of the action. */
  outcome: "success" | "failure";
  /** Reason for failure (if applicable). */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ym(): { year: string; month: string } {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0"),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write an audit log entry.
 *
 * Fire-and-forget. Never throws. Safe to call anywhere.
 * Do NOT pass secrets, tokens, OTPs, or passwords in any field.
 */
export function writeAuditLog(
  entry: Omit<AuditEntry, "_serverTs" | "clientTimestampMs">,
): void {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    const { year, month } = ym();
    const logRef = ref(db, `AuditLog/${year}/${month}`);
    const record: AuditEntry = {
      ...entry,
      _serverTs: serverTimestamp(),
      clientTimestampMs: Date.now(),
    };
    void push(logRef, record).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[audit] write failed:",
        err instanceof Error ? err.message : String(err),
      );
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[audit] init failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Convenience: log a successful action.
 */
export function auditSuccess(
  actorId: string,
  action: AuditAction,
  target: string,
  opts: {
    actorName?: string;
    targetId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    correlationId?: string;
  } = {},
): void {
  writeAuditLog({
    actorId,
    actorName: opts.actorName,
    action,
    target,
    targetId: opts.targetId,
    before: opts.before,
    after: opts.after,
    correlationId: opts.correlationId,
    outcome: "success",
  });
}

/**
 * Convenience: log a failed action attempt.
 */
export function auditFailure(
  actorId: string,
  action: AuditAction,
  target: string,
  failureReason: string,
  opts: {
    actorName?: string;
    targetId?: string;
    correlationId?: string;
  } = {},
): void {
  writeAuditLog({
    actorId,
    actorName: opts.actorName,
    action,
    target,
    targetId: opts.targetId,
    correlationId: opts.correlationId,
    outcome: "failure",
    failureReason,
  });
}
