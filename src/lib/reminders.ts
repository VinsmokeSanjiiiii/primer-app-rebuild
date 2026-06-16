// ---------------------------------------------------------------------------
// Native Android shift reminders via Capacitor LocalNotifications
// ---------------------------------------------------------------------------
// Schedules repeating daily notifications for shift start / shift end so the
// user gets notified even when the app is killed or backgrounded.
//
// Plugin is a no-op outside Android — calls are guarded so the same code can
// run in the browser preview and on web builds without throwing.
// ---------------------------------------------------------------------------
import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type ScheduleOptions,
} from "@capacitor/local-notifications";

const CHANNEL_ID = "primer-shifts";
const SHIFT_START_ID = 1001;
const SHIFT_END_ID = 1002;

function isNative(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

let channelEnsured = false;
async function ensureChannel(): Promise<void> {
  if (!isNative() || channelEnsured) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Shift reminders",
      description: "Reminders for shift start and shift end",
      importance: 4, // HIGH
      visibility: 1,
      vibration: true,
    });
    channelEnsured = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[reminders] createChannel failed", err);
  }
}

/** Ask for notification permission. Safe to call repeatedly. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[reminders] requestPermissions failed", err);
    return false;
  }
}

interface ReminderTime {
  /** 24-hour clock e.g. "08:45" */
  time: string;
  title: string;
  body: string;
}

function parseHHMM(s: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Schedule (or reschedule) daily shift reminders. Existing reminders with
 * the same ids are replaced so calling this multiple times is safe.
 */
export async function scheduleShiftReminders(opts: {
  shiftStart?: string;
  shiftEnd?: string;
}): Promise<void> {
  if (!isNative()) return;
  const granted = await requestReminderPermission();
  if (!granted) return;
  await ensureChannel();

  const reminders: Array<ReminderTime & { id: number }> = [];
  const start = opts.shiftStart && parseHHMM(opts.shiftStart);
  const end = opts.shiftEnd && parseHHMM(opts.shiftEnd);
  if (start) {
    reminders.push({
      id: SHIFT_START_ID,
      time: opts.shiftStart!,
      title: "Shift starting soon",
      body: "Don't forget to clock in.",
    });
  }
  if (end) {
    reminders.push({
      id: SHIFT_END_ID,
      time: opts.shiftEnd!,
      title: "Shift ending soon",
      body: "Don't forget to clock out.",
    });
  }
  if (reminders.length === 0) return;

  try {
    // Cancel previous instances first so the schedule is deterministic.
    await LocalNotifications.cancel({
      notifications: reminders.map((r) => ({ id: r.id })),
    }).catch(() => undefined);

    const payload: ScheduleOptions = {
      notifications: reminders.map((r) => {
        const t = parseHHMM(r.time)!;
        return {
          id: r.id,
          title: r.title,
          body: r.body,
          channelId: CHANNEL_ID,
          schedule: {
            on: { hour: t.hour, minute: t.minute },
            allowWhileIdle: true,
            repeats: true,
          },
        };
      }),
    };
    await LocalNotifications.schedule(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[reminders] schedule failed", err);
  }
}

export async function cancelShiftReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: SHIFT_START_ID }, { id: SHIFT_END_ID }],
    });
  } catch {
    /* ignore */
  }
}
