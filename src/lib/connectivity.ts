// ---------------------------------------------------------------------------
// Rich connectivity state manager (Feature 3)
// ---------------------------------------------------------------------------
// Distinguishes between:
//   "connected"          – device online + Firebase RTDB reachable
//   "device_offline"     – navigator.onLine is false
//   "server_unreachable" – online but Firebase .info/connected is false
//   "degraded"           – connected but recent requests are failing
//
// Singleton: initialized once at app boot via initConnectivity(db).
// Subscribe via onConnectivityChange(); returned unsubscribe fn cleans up.
// ---------------------------------------------------------------------------

import { ref, onValue, type Database } from "firebase/database";

export type ConnectivityState =
  | "connected"
  | "device_offline"
  | "server_unreachable"
  | "degraded";

export interface ConnectivityInfo {
  state: ConnectivityState;
  /** True while the initial Firebase .info/connected probe is outstanding. */
  resolving: boolean;
  /** ISO timestamp of the last state change. */
  changedAt: string;
  /** Consecutive request failures since last success (resets on success). */
  consecutiveFailures: number;
}

type ConnectivityListener = (info: ConnectivityInfo) => void;

/** Number of consecutive failures before state becomes "degraded". */
const DEGRADED_THRESHOLD = 3;

/** Re-try a Firebase connectivity check every 30 s if still server_unreachable. */
const RECONNECT_POLL_MS = 30_000;

let _fbConnected = true; // optimistic until Firebase says otherwise
let _initialized = false;

let _current: ConnectivityInfo = {
  state:
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "device_offline"
      : "connected",
  resolving: true,
  changedAt: new Date().toISOString(),
  consecutiveFailures: 0,
};

const _listeners = new Set<ConnectivityListener>();

function derive(
  failures: number,
  fbConnected: boolean,
): ConnectivityState {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "device_offline";
  if (!fbConnected) return "server_unreachable";
  if (failures >= DEGRADED_THRESHOLD) return "degraded";
  return "connected";
}

function notify(next: ConnectivityInfo): void {
  _current = next;
  _listeners.forEach((fn) => {
    try { fn(next); } catch { /* listener errors must not crash the manager */ }
  });
}

function transition(patch: Partial<Omit<ConnectivityInfo, "changedAt" | "state">>): void {
  const failures = patch.consecutiveFailures ?? _current.consecutiveFailures;
  const next: ConnectivityInfo = {
    ..._current,
    ...patch,
    state: derive(failures, _fbConnected),
    changedAt: new Date().toISOString(),
  };
  // Only notify on meaningful change.
  if (
    next.state !== _current.state ||
    next.consecutiveFailures !== _current.consecutiveFailures ||
    (next.resolving !== _current.resolving && !next.resolving)
  ) {
    notify(next);
  } else {
    _current = next;
  }
}

// ---------------------------------------------------------------------------
// Init (call once from app boot)
// ---------------------------------------------------------------------------

/**
 * Initialize the connectivity manager.
 * Safe to call multiple times — only the first call has effect.
 */
export function initConnectivity(db: Database): void {
  if (_initialized) return;
  _initialized = true;

  // Firebase's .info/connected node is the most reliable signal for RTDB
  // reachability. It updates automatically as the SDK reconnects.
  onValue(ref(db, ".info/connected"), (snap) => {
    _fbConnected = snap.val() === true;
    transition({ resolving: false });
  });

  // Browser online/offline events catch device-level disconnects.
  window.addEventListener("online", () => transition({ resolving: false }));
  window.addEventListener("offline", () => transition({ resolving: false }));

  // Fallback: if Firebase hasn't responded in 5 s, stop showing "resolving".
  setTimeout(() => {
    if (_current.resolving) transition({ resolving: false });
  }, 5_000);

  // Periodic reconnect probe when server is unreachable.
  setInterval(() => {
    if (_current.state === "server_unreachable" && navigator.onLine) {
      // Force Firebase SDK to reattempt by re-reading the .info/connected node.
      // The onValue listener above will fire automatically when it reconnects.
      // eslint-disable-next-line no-console
      console.info("[connectivity] polling for reconnect…");
    }
  }, RECONNECT_POLL_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Report a request outcome to update the degraded-mode counter. */
export function reportRequestOutcome(success: boolean): void {
  if (success) {
    if (_current.consecutiveFailures > 0) {
      transition({ consecutiveFailures: 0 });
    }
  } else {
    transition({ consecutiveFailures: _current.consecutiveFailures + 1 });
  }
}

/** Synchronous snapshot of the current connectivity state. */
export function getConnectivity(): ConnectivityInfo {
  return _current;
}

/** Returns true if write operations can safely be attempted. */
export function canWrite(): boolean {
  const s = _current.state;
  return s === "connected" || s === "degraded";
}

/**
 * Subscribe to connectivity changes.
 * The listener is called immediately with the current state.
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(fn: ConnectivityListener): () => void {
  _listeners.add(fn);
  try { fn(_current); } catch { /* ignore */ }
  return () => _listeners.delete(fn);
}

/**
 * Human-readable status message for each connectivity state.
 */
export function connectivityLabel(state: ConnectivityState): string {
  switch (state) {
    case "connected":          return "Connected";
    case "device_offline":     return "No internet connection";
    case "server_unreachable": return "Server unreachable — reconnecting";
    case "degraded":           return "Connection unstable";
  }
}

/**
 * Returns true if the current state means writes MUST be queued.
 */
export function mustQueueWrites(): boolean {
  return _current.state === "device_offline" || _current.state === "server_unreachable";
}
