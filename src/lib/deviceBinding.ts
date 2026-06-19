/**
 * Real device-binding service.
 *
 * Generates a stable installation ID per device and persists it
 * through Capacitor Preferences on native, or localStorage on web.
 * The same ID is reused on every launch; the database `Profile/<id>
 * /Device_ID` field records which device is bound to an account.
 *
 * No fake browser fingerprinting — installation IDs are the trust
 * anchor and are paired with a server-side binding record.
 */

import { log } from "./log";

const STORAGE_KEY = "primer_device_binding_id_v1";

let _cached: string | null = null;
let _capPreferences:
  | typeof import("@capacitor/preferences").Preferences
  | null
  | undefined;

async function getCapPreferences() {
  if (_capPreferences !== undefined) return _capPreferences;
  try {
    // Capacitor Preferences exists on native, but the JS shim is also safe to
    // load on web (it falls through to a memory/localStorage fallback in the
    // SDK). We still prefer plain localStorage on web for predictability.
    const mod = await import("@capacitor/preferences");
    _capPreferences = mod.Preferences ?? null;
  } catch {
    _capPreferences = null;
  }
  return _capPreferences;
}

function isNative(): boolean {
  try {
    // The Capacitor global is injected by the native shell.
    const cap = (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  // Last-resort fallback. Should never run on supported targets.
  return `bind-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

async function readPersisted(): Promise<string | null> {
  if (isNative()) {
    const prefs = await getCapPreferences();
    if (prefs) {
      try {
        const res = await prefs.get({ key: STORAGE_KEY });
        if (res?.value) return res.value;
      } catch (e) {
        log.warn("binding", "Preferences.get failed", e);
      }
    }
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writePersisted(id: string): Promise<void> {
  if (isNative()) {
    const prefs = await getCapPreferences();
    if (prefs) {
      try {
        await prefs.set({ key: STORAGE_KEY, value: id });
      } catch (e) {
        log.warn("binding", "Preferences.set failed", e);
      }
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Returns the stable installation ID for this device, generating and
 * persisting one on first call. Safe to invoke from anywhere; cached
 * after the first await.
 */
export async function getOrCreateBindingId(): Promise<string> {
  if (_cached) return _cached;
  const existing = await readPersisted();
  if (existing && existing.length > 0) {
    _cached = existing;
    return existing;
  }
  const fresh = randomId();
  _cached = fresh;
  await writePersisted(fresh);
  log.info("binding", "generated new device binding id");
  return fresh;
}

/**
 * Synchronous read of the cached binding id. Returns null if
 * getOrCreateBindingId() hasn't completed yet; UI code should call
 * the async variant on mount and store the result.
 */
export function getCachedBindingId(): string | null {
  return _cached;
}

/**
 * Compares the local binding id with the value recorded on the
 * profile. Defaults to **false** on any error so callers cannot
 * accidentally treat an unknown state as a match.
 */
export function bindingMatches(
  localId: string | null | undefined,
  profileDeviceId: string | null | undefined,
): boolean {
  if (!localId || !profileDeviceId) return false;
  return localId === profileDeviceId;
}

/**
 * Test seam: wipe the in-memory cache. Production code never needs
 * to call this — the persisted value is read on next startup.
 */
export function __resetBindingCacheForTests(): void {
  _cached = null;
  _capPreferences = undefined;
}
