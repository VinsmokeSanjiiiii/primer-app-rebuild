// ---------------------------------------------------------------------------
// Durable offline write queue (Feature 1)
// ---------------------------------------------------------------------------
// Persists pending writes to localStorage so they survive tab/app restarts.
// Each entry carries a dedupKey — the same key is never submitted twice.
// Queue is processed automatically when connectivity returns.
//
// Entry lifecycle: pending → in_flight → cleared on success
//                                      → failed_permanent on max retries
// ---------------------------------------------------------------------------

import { classifyError } from "./repoSafe";

const QUEUE_KEY = "primer_write_queue";
const BACKOFF_BASE_MS = 1000;

export interface WriteQueueEntry {
  /** Unique entry ID (random). */
  id: string;
  /** Deduplication key — same key = same logical operation, never duplicated. */
  dedupKey: string;
  /** Machine-readable operation type for the executor to dispatch on. */
  opType: string;
  /** Serializable payload needed to replay this write. No secrets. */
  payload: unknown;
  /** Unix-ms when originally enqueued. */
  enqueuedAt: number;
  /** Number of times attempted so far. */
  retryCount: number;
  /** Maximum allowed attempts before permanent failure. */
  maxRetries: number;
  /** Last error message string (for display + debugging). */
  lastError?: string;
  /** Current lifecycle status. */
  status: "pending" | "in_flight" | "failed_permanent";
}

function loadQueue(): WriteQueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WriteQueueEntry[];
    // Reset stale in_flight entries to pending (app was killed mid-process).
    return parsed.map((e) =>
      e.status === "in_flight" ? { ...e, status: "pending" as const } : e,
    );
  } catch {
    return [];
  }
}

function saveQueue(entries: WriteQueueEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    /* storage quota — non-fatal; will retry from memory */
  }
}

function genId(): string {
  return `wq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a write that failed due to a network error.
 * If an entry with the same dedupKey already exists and is not permanently
 * failed, it will NOT be duplicated (idempotent enqueue).
 *
 * @returns true if a new entry was added, false if deduped.
 */
export function enqueueWrite(
  entry: Omit<WriteQueueEntry, "id" | "enqueuedAt" | "retryCount" | "status">,
): boolean {
  const queue = loadQueue();
  const existing = queue.find(
    (e) => e.dedupKey === entry.dedupKey && e.status !== "failed_permanent",
  );
  if (existing) return false; // already queued

  const newEntry: WriteQueueEntry = {
    ...entry,
    id: genId(),
    enqueuedAt: Date.now(),
    retryCount: 0,
    status: "pending",
  };
  saveQueue([...queue, newEntry]);
  // eslint-disable-next-line no-console
  console.info(`[writeQueue] enqueued ${entry.opType} (dedupKey=${entry.dedupKey})`);
  return true;
}

/** Return pending + permanent-failure counts. */
export function getQueueStats(): { pending: number; failed: number; total: number } {
  const q = loadQueue();
  return {
    pending: q.filter((e) => e.status === "pending").length,
    failed: q.filter((e) => e.status === "failed_permanent").length,
    total: q.length,
  };
}

/** Return all permanently failed entries for admin/user display. */
export function getFailedEntries(): WriteQueueEntry[] {
  return loadQueue().filter((e) => e.status === "failed_permanent");
}

/** Dismiss a permanently failed entry (user-acknowledged). */
export function dismissFailedEntry(id: string): void {
  saveQueue(loadQueue().filter((e) => e.id !== id));
}

/** Clear the entire queue. Call on sign-out. */
export function clearWriteQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

/** Executor signature: maps opType + payload → a write Promise. */
export type QueuedOpExecutor = (
  opType: string,
  payload: unknown,
) => Promise<{ ok: boolean; error?: unknown }>;

/**
 * Process all pending queue entries using the provided executor.
 *
 * Entries are processed in FIFO order. On a transient network error, the
 * current entry's retryCount is incremented and processing stops (the
 * caller should call again on the next `online` event). On permanent
 * failure (non-network error, or max retries exhausted) the entry moves
 * to `failed_permanent` and `onPermanentFailure` is called.
 */
export async function processWriteQueue(
  executor: QueuedOpExecutor,
  onPermanentFailure?: (entry: WriteQueueEntry) => void,
): Promise<void> {
  const pending = loadQueue().filter((e) => e.status === "pending");
  if (pending.length === 0) return;

  // eslint-disable-next-line no-console
  console.info(`[writeQueue] processing ${pending.length} pending entries`);

  for (const entry of pending) {
    // Mark in_flight
    saveQueue(
      loadQueue().map((e) =>
        e.id === entry.id ? { ...e, status: "in_flight" as const } : e,
      ),
    );

    const attempt = entry.retryCount + 1;
    let result: { ok: boolean; error?: unknown };
    try {
      result = await executor(entry.opType, entry.payload);
    } catch (err) {
      result = { ok: false, error: err };
    }

    if (result.ok) {
      // Success — remove from queue.
      saveQueue(loadQueue().filter((e) => e.id !== entry.id));
      // eslint-disable-next-line no-console
      console.info(`[writeQueue] ${entry.opType} succeeded (attempt ${attempt})`);
    } else {
      const kind = classifyError(result.error);
      const errorMsg =
        result.error instanceof Error
          ? result.error.message
          : String(result.error ?? "unknown error");

      if (kind !== "network" || attempt >= entry.maxRetries) {
        // Permanent failure — quarantine the entry.
        saveQueue(
          loadQueue().map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: "failed_permanent" as const,
                  retryCount: attempt,
                  lastError: errorMsg,
                }
              : e,
          ),
        );
        const failed = { ...entry, status: "failed_permanent" as const, lastError: errorMsg };
        // eslint-disable-next-line no-console
        console.error(`[writeQueue] ${entry.opType} permanently failed:`, errorMsg);
        onPermanentFailure?.(failed);
      } else {
        // Transient network failure — back off and stop for now.
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.min(attempt - 1, 4));
        await new Promise((r) => setTimeout(r, backoffMs));
        saveQueue(
          loadQueue().map((e) =>
            e.id === entry.id
              ? { ...e, status: "pending" as const, retryCount: attempt, lastError: errorMsg }
              : e,
          ),
        );
        // eslint-disable-next-line no-console
        console.warn(`[writeQueue] ${entry.opType} retryable failure (attempt ${attempt}); will retry on reconnect`);
        break; // Stop; resume on next online event.
      }
    }
  }
}
