// ---------------------------------------------------------------------------
// Structured error reporting and operational telemetry (Feature 7)
// ---------------------------------------------------------------------------
// Generates correlation IDs for tracing operations across client + server.
// Writes structured records to Firebase /ErrorLog/{year}/{month} (non-blocking).
// Always console-logs at the appropriate level for local debugging.
//
// NEVER log secrets, OTPs, tokens, passwords, or PII payloads here.
// ---------------------------------------------------------------------------

import { ref, push, serverTimestamp } from "firebase/database";
import { getDb, isFirebaseConfigured } from "../data/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TelemetryCategory =
  | "api_failure"
  | "db_failure"
  | "auth_failure"
  | "offline_queue_failure"
  | "sync_failure"
  | "update_failure"
  | "device_binding_failure"
  | "connectivity"
  | "unknown";

export interface TelemetryRecord {
  /** Correlation ID — link this to an audit entry or API request. */
  correlationId: string;
  /** Firebase server timestamp. */
  _serverTs?: ReturnType<typeof serverTimestamp>;
  /** Client-side timestamp in ms. */
  clientTimestampMs: number;
  level: "error" | "warn" | "info";
  category: TelemetryCategory;
  /** Short, displayable message — safe for admin UIs. */
  message: string;
  /**
   * Structured context — must NOT contain secrets, tokens, OTPs,
   * passwords, or raw PII payloads.
   */
  context: Record<string, unknown>;
  /** Employee ID if known (for scoped querying). */
  employeeId?: string;
}

// ---------------------------------------------------------------------------
// Correlation IDs
// ---------------------------------------------------------------------------

/**
 * Generate a new correlation ID for an operation.
 * Format: cid_<timestamp36>_<random6>
 */
export function newCorrelationId(): string {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
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
 * Report a structured telemetry event. Non-blocking, never throws.
 *
 * Always console-logs for local dev. Writes to Firebase /ErrorLog in prod.
 * Do NOT include secrets, tokens, passwords, or PII in `context`.
 */
export function reportTelemetry(
  record: Omit<TelemetryRecord, "_serverTs" | "clientTimestampMs">,
): void {
  // Local logging at appropriate level.
  const prefix = `[telemetry:${record.category}] (${record.correlationId})`;
  if (record.level === "error") {
    // eslint-disable-next-line no-console
    console.error(prefix, record.message, record.context);
  } else if (record.level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(prefix, record.message, record.context);
  } else {
    // eslint-disable-next-line no-console
    console.info(prefix, record.message, record.context);
  }

  if (!isFirebaseConfigured()) return;

  try {
    const db = getDb();
    const { year, month } = ym();
    const logRef = ref(db, `ErrorLog/${year}/${month}`);
    const full: TelemetryRecord = {
      ...record,
      _serverTs: serverTimestamp(),
      clientTimestampMs: Date.now(),
    };
    void push(logRef, full).catch(() => {
      /* silently swallow — telemetry must never crash the app */
    });
  } catch {
    /* silently swallow */
  }
}

/**
 * Wrap an async operation with automatic telemetry reporting on failure.
 * The returned correlation ID is the same one passed to `fn`, so callers
 * can attach it to audit log entries.
 */
export async function withTelemetry<T>(
  label: string,
  category: TelemetryCategory,
  fn: (correlationId: string) => Promise<T>,
  opts: {
    employeeId?: string;
    /** Safe context keys — no secrets. */
    context?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const correlationId = newCorrelationId();
  try {
    return await fn(correlationId);
  } catch (err) {
    reportTelemetry({
      correlationId,
      level: "error",
      category,
      message: `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
      context: {
        ...(opts.context ?? {}),
        errorType: err instanceof Error ? err.constructor.name : typeof err,
      },
      employeeId: opts.employeeId,
    });
    throw err;
  }
}

/**
 * Report a known error without re-throwing.
 * Use for non-fatal errors where you want observability but not a crash.
 */
export function reportError(
  label: string,
  category: TelemetryCategory,
  err: unknown,
  opts: {
    employeeId?: string;
    correlationId?: string;
    context?: Record<string, unknown>;
  } = {},
): void {
  reportTelemetry({
    correlationId: opts.correlationId ?? newCorrelationId(),
    level: "error",
    category,
    message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
    context: {
      ...(opts.context ?? {}),
      errorType: err instanceof Error ? err.constructor.name : typeof err,
    },
    employeeId: opts.employeeId,
  });
}
