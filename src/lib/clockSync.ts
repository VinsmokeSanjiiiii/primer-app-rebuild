// ---------------------------------------------------------------------------
// Clock synchronization helpers
// ---------------------------------------------------------------------------
// Owns the merge rules between:
//   - the persisted local active-session backup,
//   - the React attendance state,
//   - the Firebase attendance collection.
//
// Reconciliation is deterministic and idempotent so it can run after
// hydrate, after sign-in, on `visibilitychange`, and on `online` events
// without producing duplicate records or losing in-flight data.
// ---------------------------------------------------------------------------
import type { AttendanceRecord } from "../types";
import type { Repository } from "../data/repository";
import {
  type ActiveSession,
  clearActiveSession,
  loadActiveSession,
  markPending,
  saveActiveSession,
} from "./activeSession";
import { safeWrite, validateAttendanceRecord } from "./repoSafe";

export interface ReconcileResult {
  /** Authoritative attendance list to push into React state. */
  attendance: AttendanceRecord[];
  /** Whether a Firebase retry is queued in the background. */
  retried: boolean;
  /** Whether the local backup was cleared after reconciliation. */
  cleared: boolean;
}

function dedupeById(list: AttendanceRecord[]): AttendanceRecord[] {
  const seen = new Set<string>();
  const out: AttendanceRecord[] = [];
  for (const r of list) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export async function reconcileActiveSession(
  repo: Repository,
  employeeId: string,
  firebaseRecords: AttendanceRecord[],
): Promise<ReconcileResult> {
  const backup = loadActiveSession(employeeId);
  const firebaseOpen = firebaseRecords.find((r) => r.isClockedIn);

  // No backup — nothing to reconcile. Firebase is the source of truth.
  if (!backup) {
    return { attendance: dedupeById(firebaseRecords), retried: false, cleared: false };
  }

  // Backup belongs to a different user (defensive — keys are scoped, but
  // a stale legacy entry could land here). Discard it.
  if (backup.employeeId !== employeeId) {
    clearActiveSession(backup.employeeId);
    return { attendance: dedupeById(firebaseRecords), retried: false, cleared: true };
  }

  // Case A: Firebase already has an open record.
  if (firebaseOpen) {
    // Same record. If backup has a pending update (closed locally but
    // Firebase still shows open), retry the update.
    if (firebaseOpen.id === backup.id && backup.pendingOp === "update") {
      void safeWrite("Clock-out sync", () => repo.updateAttendance(backup.id, backup), {
        retries: 2,
      }).then((res) => {
        if (res.ok) clearActiveSession(employeeId);
      });
      return {
        attendance: dedupeById([backup, ...firebaseRecords.filter((r) => r.id !== backup.id)]),
        retried: true,
        cleared: false,
      };
    }
    // Otherwise the Firebase record wins; the backup is redundant.
    clearActiveSession(employeeId);
    return { attendance: dedupeById(firebaseRecords), retried: false, cleared: true };
  }

  // Case B: Firebase has no open record but backup has one closed locally.
  // The clock-out finalization never landed — retry the update path.
  if (!backup.isClockedIn && backup.pendingOp === "update") {
    void safeWrite("Clock-out sync", () => repo.updateAttendance(backup.id, backup), {
      retries: 2,
    }).then((res) => {
      if (res.ok) clearActiveSession(employeeId);
    });
    return {
      attendance: dedupeById([backup, ...firebaseRecords]),
      retried: true,
      cleared: false,
    };
  }

  // Case C: Firebase has no open record and backup is an in-flight open
  // session (pending create or already created but Firebase fetch missed it).
  // Restore it into state immediately so the UI shows "Clocked in at …".
  if (backup.isClockedIn) {
    if (backup.pendingOp === "create" || backup.pendingOp == null) {
      void safeWrite("Clock-in sync", () => repo.createAttendance(backup), {
        retries: 2,
      }).then((res) => {
        if (res.ok) {
          // Keep the backup (still need it until clock-out) but clear pendingOp.
          saveActiveSession(markPending(backup, null));
        }
      });
    }
    return {
      attendance: dedupeById([backup, ...firebaseRecords]),
      retried: true,
      cleared: false,
    };
  }

  // Fallback — backup is in a closed state with no pending op (already synced).
  clearActiveSession(employeeId);
  return { attendance: dedupeById(firebaseRecords), retried: false, cleared: true };
}

/**
 * Persist an attendance write with retry. Updates the backup with the latest
 * pendingOp/lastError so a subsequent reconciliation can finish the job.
 */
export async function persistAttendanceWithRetry(
  label: string,
  op: "create" | "update",
  rec: ActiveSession,
  repo: Repository,
  toast?: (text: string, kind: "error" | "info") => void,
): Promise<boolean> {
  const invalid = validateAttendanceRecord(rec);
  if (invalid) {
    toast?.(`${label} blocked — ${invalid}.`, "error");
    return false;
  }
  const res = await safeWrite(
    label,
    () =>
      op === "create"
        ? repo.createAttendance(rec)
        : repo.updateAttendance(rec.id, rec),
    { critical: true, retries: 2, toast },
  );
  if (res.ok) return true;
  // Preserve the backup so reconciliation can retry on the next hydrate.
  saveActiveSession(
    markPending(rec, op, res.error instanceof Error ? res.error.message : String(res.error ?? "")),
  );
  return false;
}
