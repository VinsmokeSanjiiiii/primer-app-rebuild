import { useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Dialog, TextArea, TextField } from "../components/ui";
import { Calendar } from "../components/Calendar";
import { startOfDay, serverNow, parseDate, monthName } from "../lib/date";

export function TechCoverage() {
  const { profile, submitTechCoverage, back, toast } = useApp();
  const [date, setDate] = useState<string[]>([]);
  const [fromT, setFromT] = useState("13:00");
  const [toT, setToT] = useState("15:00");
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);

  const disabledReason = (d: Date) =>
    d > startOfDay(serverNow()) ? "Future date" : null;

  const canReview = date.length > 0 && reason.trim().length > 0 && hours > 0;

  const confirm = () => {
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

        <Button full disabled={!canReview} onClick={() => canReview ? setReview(true) : toast("Complete all fields.", "error")} icon="check">
          Review request
        </Button>
      </div>

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
