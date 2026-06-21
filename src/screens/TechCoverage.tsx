import { useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Dialog, TextArea, TextField } from "../components/ui";
import { Icon } from "../components/Icon";
import { Calendar } from "../components/Calendar";
import { startOfDay, serverNow, parseDate, monthName } from "../lib/date";

// Maintenance mode - Tech Issue requests are currently disabled
const MAINTENANCE_MODE = false;

export function TechCoverage() {
  const { profile, submitTechCoverage, back, toast } = useApp();
  const [showMaintenance, setShowMaintenance] = useState(true);
  const [date, setDate] = useState<string[]>([]);
  const [fromT, setFromT] = useState("13:00");
  const [toT, setToT] = useState("15:00");
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);

  const disabledReason = (d: Date) =>
    d > startOfDay(serverNow()) ? "Future date" : null;

  const canReview = date.length > 0 && reason.trim().length > 0 && hours > 0;

  const openReview = () => {
    if (MAINTENANCE_MODE) {
      setShowMaintenance(true);
      return;
    }
    if (!canReview) {
      toast("Complete all fields.", "error");
      return;
    }
    setReview(true);
  };

  const confirm = () => {
    if (MAINTENANCE_MODE) return;
    const d = date[0];
    submitTechCoverage({
      employeeId: profile.employeeId,
      requesterId: profile.employeeId,
      requesterName: profile.fullName,
      coverageDate: d,
      coverageTime: `${fromT} - ${toT}`,
      coverageType: "Tech Issue",
      coverageStatus: "Available",
      forCoverageHours: hours,
      daysOff: profile.daysOff,
      position: profile.position,
      schedule: profile.schedule,
      month: monthName(parseDate(d)),
      year: serverNow().getFullYear(),
      team: profile.team,
      reason: reason.trim(),
    });
    setReview(false);
    back();
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Tech Issue Coverage" subtitle="Report hours lost" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* Maintenance banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={18} className="text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              This feature is currently under maintenance
            </p>
          </div>
          <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
            Tech issue coverage requests cannot be submitted at this time. Please check back later.
          </p>
        </div>

        <p className="text-xs font-bold uppercase text-slate-400">Issue date</p>
        <Calendar selected={date} onToggle={(d) => setDate([d])} disabledReason={disabledReason} single />

        <Card>
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">Time of issue</p>
          <div className="flex items-center gap-2">
            <input type="time" value={fromT} onChange={(e) => setFromT(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white" />
            <span className="text-slate-400">to</span>
            <input type="time" value={toT} onChange={(e) => setToT(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white" />
          </div>
        </Card>

        <TextField
          label="Total hours lost"
          type="number" min={0.5} max={12} step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />

        <TextArea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the technical issue…" />

        <Button full disabled={!canReview} onClick={openReview} icon="check">
          Review request
        </Button>
      </div>

      {/* Maintenance mode dialog */}
      <Dialog
        open={showMaintenance}
        onClose={() => setShowMaintenance(false)}
        title="Feature Unavailable"
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
            <Icon name="alert" size={28} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Tech issue coverage is under maintenance</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              This feature is temporarily disabled. Please check back later or contact your supervisor.
            </p>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={review}
        onClose={() => setReview(false)}
        title="Review coverage request"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setReview(false)}>Back</Button>
            <Button full onClick={confirm} icon="check">Submit</Button>
          </>
        }
      >
        <ReviewRow label="Type" value="Tech Issue" />
        <ReviewRow label="Date" value={date[0] ?? ""} />
        <ReviewRow label="Time" value={`${fromT} - ${toT}`} />
        <ReviewRow label="Hours lost" value={`${hours}`} />
        <ReviewRow label="Reason" value={reason} />
      </Dialog>
    </div>
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
