import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { serverNow, deviceTimeIsSafe, fmtTime, fmtDate } from "../lib/date";
import { scheduleShiftReminders } from "../lib/reminders";

const REMINDER_LEAD_MIN = 5;

/** Parse a schedule string like "08:45-18:00" or "00:00 - 09:00" into HH:MM start/end. */
function parseSchedule(schedule: string): { start: string; end: string } | null {
  if (!schedule) return null;
  const m = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/.exec(schedule);
  if (!m) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const sh = Number(m[1]), sm = Number(m[2]), eh = Number(m[3]), em = Number(m[4]);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` };
}

/** Subtract N minutes from an HH:MM string, wrapping across midnight. */
function shiftMinutes(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + deltaMin;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function Clock() {
  const { profile, clockIn, clockOut, navigate, attendance, clockBusy } = useApp();
  const [now, setNow] = useState(serverNow());
  const [verifying, setVerifying] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock — updates every second using server-adjusted time
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, []);

  // Network connectivity detection
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Cleanup pending verify timer on unmount
  useEffect(() => {
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
    };
  }, []);

  // Compute per-user shift reminders from profile.schedule, 5 min early.
  const sched = parseSchedule(profile.schedule);
  const shiftStartReminder = sched ? shiftMinutes(sched.start, -REMINDER_LEAD_MIN) : null;
  const shiftEndReminder = sched ? shiftMinutes(sched.end, -REMINDER_LEAD_MIN) : null;

  // Schedule native Android shift reminders (no-op on web). Re-schedules when
  // the user's profile schedule changes.
  useEffect(() => {
    if (!shiftStartReminder && !shiftEndReminder) return;
    void scheduleShiftReminders({
      shiftStart: shiftStartReminder ?? undefined,
      shiftEnd: shiftEndReminder ?? undefined,
    });
  }, [shiftStartReminder, shiftEndReminder]);

  const safe = deviceTimeIsSafe();
  const skewMs = Math.abs(Date.now() - serverNow().getTime());

  // Authoritative active-session derivation: attendance state is the source
  // of truth (store reconciles it from the local backup on hydrate), the
  // profile flag is only a mirror for backward compatibility.
  const openRecord = attendance.find((r) => r.isClockedIn);
  const isClockedIn = !!openRecord;

  // Calculate elapsed time for the active session
  const elapsedLabel = (() => {
    if (!openRecord?.clockInTs) return null;
    const ms = Date.now() - openRecord.clockInTs;
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}h ${m}m elapsed` : `${m}m elapsed`;
  })();

  const doClock = async () => {
    if (!safe || !isOnline || verifying || clockBusy) return;
    setVerifying(true);
    // 900ms window — allows server-time cross-check to settle
    await new Promise<void>((resolve) => {
      verifyTimer.current = setTimeout(() => {
        verifyTimer.current = null;
        resolve();
      }, 900);
    });
    setVerifying(false);
    if (isClockedIn) await clockOut();
    else await clockIn();
  };

  const canAct = safe && isOnline && !verifying && !clockBusy;

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Time Clock" subtitle="Secure server-time verified" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">

        {/* Big clock */}
        <Card className="bg-gradient-to-br from-slate-900 to-indigo-900 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-white/60">Server time · Asia/Manila</p>
          <p className="mt-2 font-mono text-5xl font-black tabular-nums">
            {fmtTime(now)}
            <span className="text-2xl text-white/50">
              :{String(now.getSeconds()).padStart(2, "0")}
            </span>
          </p>
          <p className="mt-1 text-sm text-white/70">{fmtDate(now)}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                isClockedIn ? "bg-emerald-400" : "bg-rose-400"
              } animate-pulse`}
            />
            {isClockedIn ? "Currently Clocked In" : "Currently Clocked Out"}
          </div>
          {profile.isFlextime && (
            <Badge tone="indigo" className="mt-3">
              Flextime Schedule
            </Badge>
          )}
        </Card>

        {/* Combined connection + server-time status banner */}
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${
            !isOnline
              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
              : !safe
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          <Icon
            name={!isOnline ? "wifi-off" : !safe ? "alert" : "shield"}
            size={16}
            className="shrink-0"
          />
          <span>
            {!isOnline
              ? "No connection — clock actions blocked"
              : !safe
                ? `Clock skewed by ${Math.round(skewMs / 1000)}s — clock actions blocked`
                : `Connected · Server time verified`}
          </span>
        </div>

        {/* Active session card — visible whenever there is an open record,
            including after a cold restart while reconciliation is in flight. */}
        {openRecord && (
          <Card>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Active session
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Clocked in at</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {openRecord.dateIn} · {openRecord.timeIn}
                </span>
              </div>
              {elapsedLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Elapsed</span>
                  <Badge tone="indigo">{elapsedLabel}</Badge>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Clock action */}
        <Button
          full
          variant={isClockedIn ? "danger" : "primary"}
          disabled={!canAct}
          onClick={doClock}
          className="py-4 text-base"
        >
          {verifying ? (
            <>Verifying server time…</>
          ) : clockBusy ? (
            <>Saving…</>
          ) : !isOnline ? (
            <><Icon name="wifi-off" size={20} /> No connection</>
          ) : !safe ? (
            <><Icon name="alert" size={20} /> Clock skewed — blocked</>
          ) : isClockedIn ? (
            <><Icon name="clock" size={20} /> Clock Out</>
          ) : (
            <><Icon name="clock" size={20} /> Clock In</>
          )}
        </Button>

        {/* Reminders */}
        <Card>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Icon name="bell" size={16} /> Scheduled reminders
          </p>
          {sched ? (
            <div className="space-y-2 text-sm">
              <ReminderRow label="Shift start reminder" time={shiftStartReminder!} tone="indigo" sub={`Shift starts ${sched.start}`} />
              <ReminderRow label="Shift end reminder" time={shiftEndReminder!} tone="sky" sub={`Shift ends ${sched.end}`} />
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              No schedule set on your profile — reminders disabled.
            </p>
          )}
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-400 dark:bg-white/5">
            Reminders fire 5 minutes before your shift start and end, via native notifications even when the app is closed.
          </p>
        </Card>

        <Button full variant="secondary" icon="calendar" onClick={() => navigate("attendance")}>
          View attendance records
        </Button>
      </div>
    </div>
  );
}

function ReminderRow({
  label,
  time,
  tone,
  sub,
}: {
  label: string;
  time: string;
  tone: "indigo" | "sky";
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <div className="min-w-0">
        <p className="text-slate-600 dark:text-slate-300">{label}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
      <Badge tone={tone}>{time}</Badge>
    </div>
  );
}
