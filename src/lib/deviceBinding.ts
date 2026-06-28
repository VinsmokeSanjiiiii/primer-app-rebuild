// Stable per-install device identity and a (best-effort) RTDB binding record.
//
// The device id lives in localStorage. It survives sign-out/sign-in and app
// restarts but resets if the user wipes app storage — which is the correct
// behaviour for "this install".
//
// Binding records are written under `DeviceBindings/{employeeId}/{deviceId}`.
// They are advisory: rebind verification is enforced in the UI, not by the
// database. Never silently swap bindings here — call `bindDevice` only after
// the rebind UI has explicitly confirmed the user's identity.

import { get, ref, remove, set, serverTimestamp } from "firebase/database";
import { getDb } from "../data/firebase";

const DEVICE_ID_KEY = "primer_device_binding_id_v1";

let cachedDeviceId: string | null = null;

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function readPersistedDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing.trim();

    // Legacy key kept for installs created before the rename.
    const legacy = localStorage.getItem("pulse.deviceId.v1");
    if (legacy && legacy.trim()) {
      const id = legacy.trim();
      persistDeviceId(id);
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

function persistDeviceId(id: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function ensureDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  const persisted = readPersistedDeviceId();
  if (persisted) {
    cachedDeviceId = persisted;
    return persisted;
  }
  const id = uuid();
  cachedDeviceId = id;
  persistDeviceId(id);
  return id;
}

export function getDeviceId(): string {
  return ensureDeviceId();
}

export async function getOrCreateBindingId(): Promise<string> {
  return ensureDeviceId();
}

export function getCachedBindingId(): string | null {
  return cachedDeviceId;
}

export function __resetBindingCacheForTests(): void {
  cachedDeviceId = null;
}

export function bindingMatches(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  return !!expected && !!actual && expected === actual;
}

export interface DeviceBindingRecord {
  deviceId: string;
  boundAt: number | object;
  lastVerifiedAt: number | object;
  userAgent: string;
  platform: string;
  label?: string;
}

function describeDevice(): { userAgent: string; platform: string } {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const platform =
    typeof navigator !== "undefined" && navigator.platform
      ? navigator.platform
      : "unknown";
  return { userAgent: ua, platform };
}

/**
 * Lists all device bindings for an employee. Empty array on error.
 */
export async function listBindings(
  employeeId: string,
): Promise<DeviceBindingRecord[]> {
  if (!employeeId) return [];
  try {
    const snap = await get(ref(getDb(), `DeviceBindings/${employeeId}`));
    const val = snap.val() as Record<string, DeviceBindingRecord> | null;
    if (!val) return [];
    return Object.values(val);
  } catch {
    return [];
  }
}

/**
 * Whether the CURRENT device has a binding record for this employee. Returns
 * `null` when the check cannot be performed (offline, permissions, etc.) —
 * callers should fail open in that case.
 */
export async function isCurrentDeviceBound(
  employeeId: string,
): Promise<boolean | null> {
  if (!employeeId) return false;
  try {
    const snap = await get(
      ref(getDb(), `DeviceBindings/${employeeId}/${getDeviceId()}`),
    );
    return snap.exists();
  } catch {
    return null;
  }
}

/**
 * Creates or refreshes the binding record for the current device.
 * Safe to call after a verified sign-in.
 */
export async function bindDevice(
  employeeId: string,
  label?: string,
): Promise<void> {
  if (!employeeId) return;
  const deviceId = getDeviceId();
  const desc = describeDevice();
  const record: DeviceBindingRecord = {
    deviceId,
    boundAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp(),
    userAgent: desc.userAgent,
    platform: desc.platform,
    label,
  };
  try {
    await set(ref(getDb(), `DeviceBindings/${employeeId}/${deviceId}`), record);
  } catch {
    /* best effort */
  }
}

export async function touchBinding(employeeId: string): Promise<void> {
  if (!employeeId) return;
  try {
    await set(
      ref(
        getDb(),
        `DeviceBindings/${employeeId}/${getDeviceId()}/lastVerifiedAt`,
      ),
      serverTimestamp(),
    );
  } catch {
    /* ignore */
  }
}

/** Revokes a binding. Use only after verifying the user's identity. */
export async function revokeBinding(
  employeeId: string,
  deviceId: string,
): Promise<void> {
  if (!employeeId || !deviceId) return;
  try {
    await remove(ref(getDb(), `DeviceBindings/${employeeId}/${deviceId}`));
  } catch {
    /* ignore */
  }
}
