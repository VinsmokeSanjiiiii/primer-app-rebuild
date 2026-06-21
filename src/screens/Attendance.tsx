import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Dialog, TextArea, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";
import { parseDate, noteIsLocked, NOTE_LOCK_HOURS } from "../lib/date";
import type { AttendanceRecord } from "../types";

export function Attendance() {
  const { attendance, updateNote } = useApp();
  const today = new Date();
  const ago = new Date();
  ago.setDate(ago.getDate() - 90);
  const [from, setFrom] = useState(toInput(ago));
  const [to, setTo] = useState(toInput(today));
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [lockedDialog, setLockedDialog] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    // Parse as local midnight (adding T00:00:00 prevents UTC-midnight parsing)
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T23:59:59");
    return attendance
      .filter((r) => {
        if (!r.dateIn) return false;
        const d = parseDate(r.dateIn);
        if (isNaN(d.getTime()) || d.getTime() === 0) return false;
        return d >= f && d <= t;
      })
      .sort((a, b) => {
        const dateDiff = parseDate(b.dateIn).getTime() - parseDate(a.dateIn).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.clockInTs ?? 0) - (a.clockInTs ?? 0);
      });
  }, [attendance, from, to]);

  const totalHours = filtered.reduce((s, r) => s + (r.totalHours ?? 0), 0);

  const tryEdit = (rec: AttendanceRecord) => {
    if (noteIsLocked(rec)) {
      setLockedDialog(true);
      return;
    }
    setEditing(rec);
    setNoteDraft(rec.note);
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Attendance" subtitle="History & notes" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* Filter */}
        <Card>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Icon name="filter" size={14} /> Date range
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
            />
          </div>
        </Card>

        {/* Total */}
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
          <div>
            <p className="text-xs text-white/70">Total hours in range</p>
            <p className="text-2xl font-black tabular-nums">{totalHours.toFixed(2)}</p>
          </div>
          <Badge tone="indigo">{filtered.length} records</Badge>
        </div>

        {/* Records */}
        {filtered.length === 0 ? (
          <EmptyState icon="calendar" title="No records" subtitle="Adjust the date range to see attendance." />
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const locked = noteIsLocked(r);
              const isOpen = expanded === r.id;
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.dateIn}</p>
                      <p className="text-xs text-slate-400">{r.recordType} · {r.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                        {r.totalHours != null ? `${r.totalHours.toFixed(2)} h` : "—"}
                      </p>
                      {r.minsLate > 0 && <Badge tone="rose">{r.minsLate}m late</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <TimeBox label="Time in" date={r.dateIn} time={r.timeIn} />
                    <TimeBox label="Time out" date={r.dateOut} time={r.timeOut} />
                  </div>

                  {/* Note */}
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Icon name={locked ? "lock" : "edit"} size={13} /> Note
                      </span>
                      <button
                        onClick={() => tryEdit(r)}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                      >
                        {locked ? "Locked" : r.note ? "Edit" : "Add note"}
                      </button>
                    </div>
                    {r.note ? (
                      <p
                        className={`mt-1 text-sm text-slate-600 dark:text-slate-300 ${isOpen ? "" : "line-clamp-2"}`}
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        {r.note}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">No note added.</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit note dialog */}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit note"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              full
              onClick={() => {
                if (editing) updateNote(editing.id, noteDraft);
                setEditing(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-400">
          Notes lock {NOTE_LOCK_HOURS} hours after clock-out (validated against server time).
        </p>
        <TextArea rows={4} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Describe your shift…" />
      </Dialog>

      {/* Locked dialog */}
      <Dialog
        open={lockedDialog}
        onClose={() => setLockedDialog(false)}
        title="Note locked"
        footer={<Button full onClick={() => setLockedDialog(false)}>Got it</Button>}
      >
        <div className="flex items-start gap-2">
          <Icon name="lock" size={18} className="mt-0.5 text-rose-500" />
          <p>
            This note can no longer be edited. Notes are locked {NOTE_LOCK_HOURS} hours after
            clock-out, or when finalized by the system.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

function TimeBox({ label, date, time }: { label: string; date?: string; time?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <p className="text-[10px] font-semibold uppercase text-slate-400">{label}</p>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{time ?? "—"}</p>
      <p className="text-[11px] text-slate-400">{date ?? ""}</p>
    </div>
  );
}

function toInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
