// ---------------------------------------------------------------------------
// Safe repository write wrapper
// ---------------------------------------------------------------------------
// Replaces silent `.catch(() => {})` blocks on the critical path with
// classified error handling, optional retry, and structured reporting.
// Keeps non-critical UX silent unless the caller opts in.
// ---------------------------------------------------------------------------

export type ErrorKind = "network" | "validation" | "permission" | "unknown";

export interface SafeWriteOptions {
  /** Show a toast on terminal failure. */
  critical?: boolean;
  /** Retry transient (network) failures this many times. Default 0. */
  retries?: number;
  /** Initial backoff in ms; doubles per attempt. */
  backoffMs?: number;
  /** Called with each retryable failure (label, attempt, err). */
  onRetry?: (kind: ErrorKind, attempt: number, err: unknown) => void;
  /** Toast emitter (kept generic so this module has no React dep). */
  toast?: (text: string, kind: "error" | "info") => void;
}

export function classifyError(err: unknown): ErrorKind {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "network";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lc = msg.toLowerCase();
  if (/network|fetch|timeout|offline|unavailable/.test(lc)) return "network";
  if (/permission|denied|unauthor/.test(lc)) return "permission";
  if (/invalid|required|validation|missing/.test(lc)) return "validation";
  return "unknown";
}

function messageFor(label: string, kind: ErrorKind): string {
  switch (kind) {
    case "network":
      return `${label} couldn't sync — you're offline. We'll retry automatically.`;
    case "permission":
      return `${label} blocked — you don't have permission for this action.`;
    case "validation":
      return `${label} couldn't save — the data was rejected. Please review and try again.`;
    default:
      return `${label} failed. Check your connection and try again.`;
  }
}

export async function safeWrite<T>(
  label: string,
  fn: () => Promise<T>,
  opts: SafeWriteOptions = {},
): Promise<{ ok: true; value: T } | { ok: false; kind: ErrorKind; error: unknown }> {
  const retries = opts.retries ?? 0;
  const backoff = opts.backoffMs ?? 600;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      // eslint-disable-next-line no-console
      console.warn(`[safeWrite] ${label} failed (${kind}, attempt ${attempt + 1}):`, err);
      if (attempt < retries && kind === "network") {
        opts.onRetry?.(kind, attempt + 1, err);
        await new Promise((r) => setTimeout(r, backoff * Math.pow(2, attempt)));
        continue;
      }
      if (opts.critical && opts.toast) {
        opts.toast(messageFor(label, kind), "error");
      }
      return { ok: false, kind, error: err };
    }
  }
  return { ok: false, kind: classifyError(lastErr), error: lastErr };
}

/** Lightweight validation guard for attendance records. */
export function validateAttendanceRecord(rec: {
  id?: string;
  employeeId?: string;
  dateIn?: string;
  timeIn?: string;
  clockInTs?: number;
}): string | null {
  if (!rec.id) return "missing id";
  if (!rec.employeeId) return "missing employeeId";
  if (!rec.dateIn || !rec.timeIn) return "missing clock-in date/time";
  if (rec.clockInTs != null && (!Number.isFinite(rec.clockInTs) || rec.clockInTs <= 0))
    return "invalid clockInTs";
  return null;
}
