import { useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Dialog, TextArea } from "../components/ui";
import { Calendar } from "../components/Calendar";
import { Icon } from "../components/Icon";
import { startOfDay, serverNow, parseDate, monthName } from "../lib/date";
import type { OtType, OtShift, OtTypeCode } from "../types";

export function OTRequest() {
  const { profile, submitOt, back, toast } = useApp();
  const [otType, setOtType] = useState<OtType>("OverTime");
  const [shift, setShift] = useState<OtShift>("Post-Shift");
  const [date, setDate] = useState<string[]>([]);
  const [duration, setDuration] = useState(2);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);

  const isRestDay = otType === "RestDay OverTime";

  const typeCode: OtTypeCode = isRestDay ? "RDOT" : shift === "Pre-Shift" ? "PREOT" : "POSTOT";

  const disabledReason = (d: Date) =>
    d < startOfDay(serverNow()) ? "Past date" : null;

  const canReview = date.length > 0 && reason.trim().length > 0;

  const openReview = () => {
    if (!canReview) {
      toast("Select a date and provide a reason.", "error");
      return;
    }
    setReview(true);
  };

  const confirm = () => {
    const d = date[0];
    submitOt({
      employeeId: profile.employeeId,
      otType,
      otShift: isRestDay ? undefined : shift,
      typeCode,
      otDate: d,
      otTime: `${duration}h block`,
      durationHours: duration,
      status: "Pending",
      reason: reason.trim(),
      fullName: profile.fullName,
      position: profile.position,
      team: profile.team,
      schedule: profile.schedule,
      month: monthName(parseDate(d)),
      year: serverNow().getFullYear(),
    });
    setReview(false);
    back();
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar title="OT Request" subtitle="Overtime / rest-day overtime" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* OT type */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">OT type</p>
          <div className="grid grid-cols-2 gap-2">
            {(["OverTime", "RestDay OverTime"] as OtType[]).map((t) => (
              <Toggle key={t} active={otType === t} onClick={() => setOtType(t)}>{t}</Toggle>
            ))}
          </div>
        </div>

        {/* Shift type only for normal OT */}
        {!isRestDay && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-slate-400">Shift type</p>
            <div className="grid grid-cols-2 gap-2">
              {(["Pre-Shift", "Post-Shift"] as OtShift[]).map((s) => (
                <Toggle key={s} active={shift === s} onClick={() => setShift(s)}>{s}</Toggle>
              ))}
            </div>
          </div>
        )}

        {/* Date */}
        <p className="text-xs font-bold uppercase text-slate-400">OT date</p>
        <Calendar selected={date} onToggle={(d) => setDate([d])} disabledReason={disabledReason} single />

        {/* Duration picker 1-6 */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Duration</p>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {duration} <span className="text-base font-semibold text-slate-400">hours</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDuration((d) => Math.max(1, d - 1))}
                disabled={duration <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 disabled:opacity-40 dark:bg-white/10 dark:text-white"
              >
                <Icon name="x" size={16} />
              </button>
              <button
                onClick={() => setDuration((d) => Math.min(6, d + 1))}
                disabled={duration >= 6}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Minimum 1 hour · maximum 6 hours</p>
        </Card>

        <TextArea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for overtime…" />

        <Button full disabled={!canReview} onClick={openReview} icon="check">Review request</Button>
      </div>

      <Dialog
        open={review}
        onClose={() => setReview(false)}
        title="Review OT request"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setReview(false)}>Back</Button>
            <Button full onClick={confirm} icon="check">Submit</Button>
          </>
        }
      >
        <ReviewRow label="OT type" value={`${otType}${isRestDay ? "" : ` · ${shift}`}`} />
        <ReviewRow label="Type code" value={typeCode} />
        <ReviewRow label="OT date" value={date[0] ?? ""} />
        <ReviewRow label="Duration" value={`${duration} hours`} />
        <ReviewRow label="Full name" value={profile.fullName} />
        <ReviewRow label="Reason" value={reason} />
      </Dialog>
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 last:border-0 dark:border-white/5">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}
