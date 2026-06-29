import { useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Dialog, TextArea } from "../components/ui";
import { Calendar } from "../components/Calendar";
import { Icon, type IconName } from "../components/Icon";
import {
  parseDate, startOfDay, serverNow, daysBetween, monthName, fmtDate, buildMonthGrid,
} from "../lib/date";
import {
  parseDaysOff, validateSelection, wouldExceedCap, committedLeaveDates,
  consecutiveRunLength, MAX_PER_REQUEST, MAX_CONSECUTIVE_BLOCK,
} from "../lib/leaveRules";
import type { LeaveType } from "../types";

const LEAVE_TYPES: { type: LeaveType; icon: IconName; desc: string }[] = [
  { type: "Vacation Leave", icon: "umbrella", desc: "Uses VL credits" },
  { type: "Sick Leave", icon: "alert", desc: "Allowed even at 0 credits" },
  { type: "Bereavement Leave", icon: "calendar", desc: "Compassionate leave" },
  { type: "Birthday Leave", icon: "bolt", desc: "Single day, birthday only" },
];

export function LeaveRequest() {
  const { profile, leaves, holidays, submitLeave, back, toast } = useApp();
  const [type, setType] = useState<LeaveType | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [creditWarn, setCreditWarn] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dayOffIdx = useMemo(() => parseDaysOff(profile.daysOff), [profile.daysOff]);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.hdate)), [holidays]);

  const requestedDates = useMemo(
    () => leaves.filter((l) => l.status !== "Cancelled" && l.status !== "Declined").flatMap((l) => l.leaveDate),
    [leaves],
  );

  const birthday = useMemo(() => {
    const b = new Date(profile.birthDate);
    return new Date(serverNow().getFullYear(), b.getMonth(), b.getDate());
  }, [profile.birthDate]);

  const single = type === "Birthday Leave";

  const disabledReason = (d: Date): string | null => {
    const today = startOfDay(serverNow());
    if (d < today) return "Past date";
    if (dayOffIdx.has(d.getDay())) return "Day off";
    if (type === "Birthday Leave") {
      // Must be the birthday itself
      if (d.getMonth() !== birthday.getMonth() || d.getDate() !== birthday.getDate())
        return "Birthday leave must be on your birthday";
      if (daysBetween(today, birthday) < 15) return "Within 15 days of birthday";
    } else {
      // All other leave types require at least 15 calendar days advance notice
      if (daysBetween(today, d) < 15) return "Must be filed 15 days in advance";
    }
    return null;
  };

  /** Dates that would push the consecutive run over the 5-day cap, given current draft + committed leaves. */
  const extraDisabled = useMemo(() => {
    if (single) return new Map<string, string>();
    const map = new Map<string, string>();
    // Scan three months around today (prev/current/next) — wide enough for the calendar view.
    const today = startOfDay(serverNow());
    const months = [
      buildMonthGrid(today.getFullYear(), today.getMonth() - 1),
      buildMonthGrid(today.getFullYear(), today.getMonth()),
      buildMonthGrid(today.getFullYear(), today.getMonth() + 1),
      buildMonthGrid(today.getFullYear(), today.getMonth() + 2),
    ];
    const committed = committedLeaveDates(leaves);
    for (const ds of dates) committed.add(ds);
    for (const grid of months) {
      for (const d of grid) {
        if (!d) continue;
        const ds = fmtDate(d);
        if (dates.includes(ds)) continue;
        if (dayOffIdx.has(d.getDay()) || holidaySet.has(ds)) continue;
        if (committed.has(ds)) continue;
        // Simulate
        const sim = new Set(committed);
        sim.add(ds);
        const len = consecutiveRunLength(d, sim, dayOffIdx, holidaySet);
        if (len > MAX_CONSECUTIVE_BLOCK) {
          map.set(ds, `Would exceed ${MAX_CONSECUTIVE_BLOCK} consecutive leave days`);
        }
      }
    }
    return map;
  }, [leaves, dates, dayOffIdx, holidaySet, single]);

  const toggle = (ds: string) => {
    if (single) {
      setDates([ds]);
      return;
    }
    setDates((prev) => {
      if (prev.includes(ds)) return prev.filter((x) => x !== ds);
      const next = [...prev, ds].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());

      // Cap per-request first (clearer message)
      if (next.length > MAX_PER_REQUEST) {
        toast(`Maximum ${MAX_PER_REQUEST} consecutive days per leave request.`, "error");
        return prev;
      }
      const first = parseDate(next[0]);
      const last = parseDate(next[next.length - 1]);
      if (daysBetween(first, last) > MAX_PER_REQUEST - 1) {
        toast(`Selected dates must be within ${MAX_PER_REQUEST} consecutive days.`, "error");
        return prev;
      }

      // Combined 5-day block check (leaves + days off + holidays)
      if (wouldExceedCap(parseDate(ds), {
        leaves, dayOffIdx, holidays: holidaySet, currentSelection: prev,
      })) {
        toast(
          `Total consecutive leave days cannot exceed ${MAX_CONSECUTIVE_BLOCK} (Days off and holidays count).`,
          "error",
        );
        return prev;
      }

      return next;
    });
  };


  const selectType = (t: LeaveType) => {
    setType(t);
    setDates([]);
    if (t === "Birthday Leave") setReason("Birthday leave");
    else setReason("");
    // Birthday validation
    if (t === "Birthday Leave") {
      const today = startOfDay(serverNow());
      if (birthday < today) {
        toast("Your birthday has already passed this year.", "error");
      }
    }
    if (t === "Vacation Leave" && profile.vlCredits <= 0) {
      setCreditWarn(true);
    }
  };

  const canReview =
    !!type &&
    dates.length > 0 &&
    (single || type === "Sick Leave" || reason.trim().length > 0);

  const openReview = () => {
    if (!type || dates.length === 0) return;
    if (type !== "Birthday Leave" && type !== "Sick Leave" && !reason.trim()) {
      toast("Please provide a reason.", "error");
      return;
    }
    setReview(true);
  };

  const confirm = async () => {
    if (!type) return;
    const sorted = [...dates].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());
    // Defense-in-depth: re-validate against the latest leaves at submit time
    if (type !== "Birthday Leave") {
      const err = validateSelection(sorted, leaves, dayOffIdx, holidaySet);
      if (err) {
        toast(err, "error");
        setReview(false);
        return;
      }
    }

    // Convert attachment to base64 and store directly in proofUrl
    let proofUrl: string | undefined = undefined;
    if (attachFile) {
      setUploading(true);
      setUploadProgress(0);
      proofUrl = await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 90));
          }
        };
        reader.onload = (e) => {
          setUploadProgress(100);
          resolve(e.target?.result as string | undefined);
        };
        reader.onerror = () => {
          toast("Could not read attachment. Submitting without it.", "error");
          resolve(undefined);
        };
        reader.readAsDataURL(attachFile);
      });
      setUploading(false);
      setUploadProgress(0);
    }

    submitLeave({
      employeeId: profile.employeeId,
      phoneName: profile.phoneName,
      leaveType: type,
      leaveDate: sorted,
      status: "Pending",
      reason: reason.trim() || (type === "Birthday Leave" ? "Birthday leave" : ""),
      fullName: profile.fullName,
      days: sorted.length,
      position: profile.position,
      year: serverNow().getFullYear(),
      month: monthName(parseDate(sorted[0])),
      daysOff: profile.daysOff,
      schedule: profile.schedule,
      ...(proofUrl ? { proofUrl } : {}),
    });
    setReview(false);
    back();
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Leave Request" subtitle="Select type and dates" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* Type selector */}
        <div className="grid grid-cols-2 gap-2">
          {LEAVE_TYPES.map((lt) => (
            <button
              key={lt.type}
              onClick={() => selectType(lt.type)}
              className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                type === lt.type
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15"
                  : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800/60"
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                <Icon name={lt.icon} size={16} />
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{lt.type}</span>
              <span className="text-[11px] text-slate-400">{lt.desc}</span>
            </button>
          ))}
        </div>

        {type && (
          <>
            <Calendar
              selected={dates}
              onToggle={toggle}
              disabledReason={disabledReason}
              holidays={holidays.map((h) => h.hdate)}
              requested={requestedDates}
              extraDisabled={extraDisabled}
              single={single}
            />

            {/* Selected summary */}
            {dates.length > 0 && (
              <Card>
                <p className="text-xs font-bold uppercase text-slate-400">Selected dates ({dates.length})</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dates.map((d) => (
                    <span key={d} className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {d}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Reason */}
            {type !== "Birthday Leave" && (
              <TextArea
                label={`Reason${type === "Sick Leave" ? " (optional)" : ""}`}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for leave…"
              />
            )}

            {/* Optional attachment */}
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-3 dark:border-white/20">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10">
                <Icon name="camera" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {attachFile ? attachFile.name : "Attachment (optional)"}
                </p>
                {attachFile && (
                  <p className="truncate text-xs text-slate-400">
                    {(attachFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachFile(f);
                }}
              />
              {attachFile ? (
                <Button
                  variant="secondary"
                  onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                >
                  Remove
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  Browse
                </Button>
              )}
            </div>

            <Button full disabled={!canReview} onClick={openReview} icon="check">
              Review request
            </Button>
          </>
        )}
      </div>

      {/* Credit warning */}
      <Dialog
        open={creditWarn}
        onClose={() => setCreditWarn(false)}
        title="Insufficient credits"
        footer={
          <>
            <Button variant="secondary" full onClick={() => { setCreditWarn(false); setType(null); }}>Cancel</Button>
            <Button full onClick={() => setCreditWarn(false)}>Proceed anyway</Button>
          </>
        }
      >
        <p>You have <b>{profile.vlCredits}</b> vacation credits. You can still submit, but it may result in a negative balance. Do you wish to proceed?</p>
      </Dialog>

      {/* Review */}
      <Dialog
        open={review}
        onClose={() => setReview(false)}
        title="Review leave request"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setReview(false)} disabled={uploading}>Back</Button>
            <Button full onClick={() => { void confirm(); }} icon="check" disabled={uploading}>
              {uploading ? `Processing… ${uploadProgress}%` : "Submit"}
            </Button>
          </>
        }
      >
        <ReviewRow label="Leave type" value={type ?? ""} />
        <ReviewRow label="Dates" value={dates.join(", ")} />
        <ReviewRow label="Days" value={`${dates.length}`} />
        <ReviewRow label="Full name" value={profile.fullName} />
        <ReviewRow label="Reason" value={reason || "Birthday leave"} />
        {attachFile && <ReviewRow label="Attachment" value={attachFile.name} />}
        {uploading && (
          <div className="mt-1 space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Preparing attachment…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Please double-check your details before submitting. Once sent, this request will be forwarded to your supervisor for approval and your leave balance will be updated.
        </p>
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
