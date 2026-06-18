import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog, TextArea, TextField } from "../components/ui";
import { Icon } from "../components/Icon";
import { StatusBadge } from "./Dashboard";
import { parseDate, startOfDay, serverNow, currentServerMonth, currentServerYear } from "../lib/date";
import { DateFilter } from "../components/DateFilter";
import type { LeaveRequest, OtRequest } from "../types";

function buildYears(): string[] {
  const curr = currentServerYear();
  const base = [2024, 2025, 2026];
  if (!base.includes(curr)) base.push(curr);
  base.sort((a, b) => a - b);
  return base.map(String);
}

export function Requests() {
  const { leaves, ot, cancelLeave, cancelOt, navigate } = useApp();
  const [tab, setTab] = useState<"leave" | "ot">("leave");
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => currentServerMonth());
  const [filterYear, setFilterYear] = useState(() => String(currentServerYear()));
  const [cancelTarget, setCancelTarget] = useState<{ kind: "leave" | "ot"; id: string } | null>(null);
  const [reason, setReason] = useState("");

  const FILTER_YEARS = useMemo(() => buildYears(), []);

  const today = startOfDay(serverNow());

  const leaveList = useMemo(
    () =>
      leaves
        .filter((l) => {
          const text = `${l.leaveType} ${l.reason} ${l.status}`.toLowerCase();
          const bySearch = text.includes(search.toLowerCase());
          const byMonth = filterMonth === "All" || l.month === filterMonth;
          const byYear = filterYear === "All" || String(l.year) === filterYear;
          return bySearch && byMonth && byYear;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [leaves, search, filterMonth, filterYear],
  );

  const otList = useMemo(
    () =>
      ot
        .filter((o) => {
          const text = `${o.otType} ${o.reason} ${o.status}`.toLowerCase();
          const bySearch = text.includes(search.toLowerCase());
          const byMonth = filterMonth === "All" || o.month === filterMonth;
          const byYear = filterYear === "All" || String(o.year) === filterYear;
          return bySearch && byMonth && byYear;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [ot, search, filterMonth, filterYear],
  );

  const canCancelLeave = (l: LeaveRequest) => {
    if (l.status !== "Pending" && l.status !== "Approved") return false;
    const first = parseDate(l.leaveDate[0]);
    return first > today;
  };
  const canCancelOt = (o: OtRequest) => {
    if (o.status !== "Pending" && o.status !== "Approved") return false;
    return parseDate(o.otDate) > today;
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar
        title="Requests"
        subtitle="Leave & overtime"
        action={
          <button onClick={() => navigate("change-leave")} className="rounded-full px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-white/5">
            Change date
          </button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* Tab bar */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["leave", "ot"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === t ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500"
              }`}>
              {t === "leave" ? `Leave (${leaveList.length})` : `OT (${otList.length})`}
            </button>
          ))}
        </div>

        {/* Month / Year filter */}
        <DateFilter
          month={filterMonth}
          year={filterYear}
          years={FILTER_YEARS}
          onMonthChange={setFilterMonth}
          onYearChange={setFilterYear}
          onReset={() => {
            setFilterMonth(currentServerMonth());
            setFilterYear(String(currentServerYear()));
          }}
        />

        <TextField placeholder="Search requests…" value={search} onChange={(e) => setSearch(e.target.value)} />

        {tab === "leave" ? (
          leaveList.length === 0 ? (
            <EmptyState icon="umbrella" title="No leave requests" subtitle="No records for the selected period." />
          ) : (
            <div className="space-y-2">
              {leaveList.map((l) => (
                <Card key={l.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{l.leaveType}</p>
                      <p className="text-xs text-slate-400">{l.requestId} · {l.days} day(s)</p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.leaveDate.map((d) => (
                      <Badge key={d} tone="indigo">{d}</Badge>
                    ))}
                  </div>
                  {l.reason && <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{l.reason}</p>}
                  {l.cancellationReason && (
                    <p className="mt-1 rounded-lg bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                      Cancelled: {l.cancellationReason}
                    </p>
                  )}
                  {canCancelLeave(l) && (
                    <Button variant="secondary" className="mt-3" full icon="x"
                      onClick={() => { setCancelTarget({ kind: "leave", id: l.id }); setReason(""); }}>
                      Cancel request
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )
        ) : otList.length === 0 ? (
          <EmptyState icon="bolt" title="No OT requests" subtitle="No records for the selected period." />
        ) : (
          <div className="space-y-2">
            {otList.map((o) => (
              <Card key={o.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{o.otType}</p>
                    <p className="text-xs text-slate-400">{o.requestId} · {o.typeCode} · {o.durationHours}h</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
                  <Icon name="calendar" size={14} /> {o.otDate}
                  {o.otShift && <Badge>{o.otShift}</Badge>}
                </div>
                {o.reason && <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{o.reason}</p>}
                {o.cancellationReason && (
                  <p className="mt-1 rounded-lg bg-rose-50 p-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                    Cancelled: {o.cancellationReason}
                  </p>
                )}
                {canCancelOt(o) && (
                  <Button variant="secondary" className="mt-3" full icon="x"
                    onClick={() => { setCancelTarget({ kind: "ot", id: o.id }); setReason(""); }}>
                    Cancel request
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel request"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setCancelTarget(null)}>Keep</Button>
            <Button variant="danger" full disabled={!reason.trim()}
              onClick={() => {
                if (!cancelTarget) return;
                if (cancelTarget.kind === "leave") cancelLeave(cancelTarget.id, reason.trim());
                else cancelOt(cancelTarget.id, reason.trim());
                setCancelTarget(null);
              }}>
              Cancel request
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-400">
          Cancelling removes the request and returns the proper leave credit.
        </p>
        <TextArea label="Cancellation reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you cancelling?" />
      </Dialog>
    </div>
  );
}
