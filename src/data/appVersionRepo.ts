/**
 * Repository helpers for AppVersion + device binding fields.
 *
 * Kept as a standalone module (rather than added to the monolithic
 * `Repository` interface) so the existing attendance/leave/OT/coverage
 * contract stays untouched. All writes use `update()` so we never
 * stomp the global release metadata or unrelated profile fields.
 */

import { ref, get, update } from "firebase/database";
import { getDb } from "./firebase";
import { log } from "../lib/log";

/**
 * Reads the device id currently recorded on the profile. Returns
 * null when the field is missing or unreadable; never throws.
 */
export async function getProfileDeviceId(
  employeeId: string,
): Promise<string | null> {
  if (!employeeId) return null;
  try {
    const snap = await get(ref(getDb(), `Users/${employeeId}/Device_ID`));
    if (!snap.exists()) return null;
    const v = snap.val();
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch (e) {
    log.warn("binding", "getProfileDeviceId failed", e);
    return null;
  }
}

/**
 * Writes a new device id to the profile, preserving the prior value
 * under `Device_ID_History` so we keep an audit trail. Uses a single
 * `update()` so other profile fields remain untouched.
 */
export async function setProfileDeviceId(
  employeeId: string,
  bindingId: string,
  previous?: string | null,
): Promise<void> {
  if (!employeeId || !bindingId) return;
  const updates: Record<string, unknown> = {
    [`Users/${employeeId}/Device_ID`]: bindingId,
    [`Users/${employeeId}/Device_ID_UpdatedAt`]: Date.now(),
  };
  if (previous && previous !== bindingId) {
    const historyKey = `Users/${employeeId}/Device_ID_History/${Date.now()}`;
    updates[historyKey] = previous;
  }
  try {
    await update(ref(getDb()), updates);
    log.info("binding", "profile device id updated");
  } catch (e) {
    log.error("binding", "setProfileDeviceId failed", e);
    throw e;
  }
}
