import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { serverNow, deviceTimeIsSafe, fmtTime, fmtDate } from "../lib/date";
import { scheduleShiftReminders } from "../lib/reminders";

const SHIFT_START = "08:45";
const SHIFT_END = "18:00";

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

  // Schedule native Android shift reminders (no-op on web).
  useEffect(() => {
    void scheduleShiftReminders({ shiftStart: SHIFT_START, shiftEnd: SHIFT_END });
  }, []);

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
          <div className="space-y-2 text-sm">
            <ReminderRow label="Shift start reminder" time={SHIFT_START} tone="indigo" />
            <ReminderRow label="Shift end reminder" time={SHIFT_END} tone="sky" />
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-400 dark:bg-white/5">
            Delivered via native notifications — fires even when the app is closed.
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
}: {
  label: string;
  time: string;
  tone: "indigo" | "sky";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <Badge tone={tone}>{time}</Badge>
    </div>
  );
}
