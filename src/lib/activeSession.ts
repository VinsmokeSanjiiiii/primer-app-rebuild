// ---------------------------------------------------------------------------
// Active clock-session backup
// ---------------------------------------------------------------------------
// Durable, per-employee local backup of the open attendance record. The
// backup survives tab/app close, network outages, and React remounts so the
// user can never "lose" an in-flight clock-in.
//
// Storage shape (JSON in localStorage):
//   key   : primer_active_session:<employeeId>
//   value : AttendanceRecord & { pendingOp?: PendingOp; lastError?: string }
//
// pendingOp tracks whether the canonical Firebase write for this record has
// been completed.  Hydration uses it to decide whether to retry a create or
// an update.  Cleared only after a successful clock-out finalization.
// ---------------------------------------------------------------------------
import type { AttendanceRecord } from "../types";

const PREFIX = "primer_active_session:";
const LEGACY_KEY = "primer_active_session";

export type PendingOp = "create" | "update" | null;

export interface ActiveSession extends AttendanceRecord {
  pendingOp?: PendingOp;
  lastError?: string;
}

function keyFor(employeeId: string): string {
  return PREFIX + employeeId;
}

export function saveActiveSession(rec: ActiveSession): void {
  try {
    if (!rec.employeeId) return;
    localStorage.setItem(keyFor(rec.employeeId), JSON.stringify(rec));
  } catch {
    /* storage unavailable — caller still keeps record in React state */
  }
}

export function clearActiveSession(employeeId: string): void {
  try {
    localStorage.removeItem(keyFor(employeeId));
    // Also clear the legacy unkeyed entry if it was migrated.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function loadActiveSession(employeeId: string): ActiveSession | null {
  try {
    // Per-employee key first.
    const raw = localStorage.getItem(keyFor(employeeId));
    if (raw) {
      const rec = JSON.parse(raw) as ActiveSession;
      if (rec?.employeeId === employeeId) return rec;
    }
    // One-time migration from the legacy unkeyed entry.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const rec = JSON.parse(legacy) as ActiveSession;
      if (rec?.employeeId === employeeId) {
        saveActiveSession(rec);
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
        return rec;
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

/** Discard every per-employee backup. Used on full sign-out. */
export function purgeAllActiveSessions(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(PREFIX) || k === LEGACY_KEY)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function markPending(
  rec: AttendanceRecord,
  op: PendingOp,
  lastError?: string,
): ActiveSession {
  return { ...(rec as ActiveSession), pendingOp: op, lastError };
}
