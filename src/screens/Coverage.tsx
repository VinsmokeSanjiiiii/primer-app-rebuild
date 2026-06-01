import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import { StatusBadge } from "./Dashboard";
import { MONTHS } from "../lib/date";
import type { CoverageRequest, CoverageStatus } from "../types";

const STATUSES: (CoverageStatus | "All")[] = [
  "All", "Available", "Ongoing", "For Approval", "Completed", "Disapproved",
];

export function Coverage() {
  const { coverage, profile, takeoverCoverage, cancelCoverage, navigate } = useApp();
  const [tab, setTab] = useState<"available" | "taken">("available");
  const [month, setMonth] = useState("All");
  const [status, setStatus] = useState<CoverageStatus | "All">("All");
  const [confirm, setConfirm] = useState<{ kind: "take" | "cancel"; req: CoverageRequest } | null>(null);

  const filtered = useMemo(() => {
    return coverage.filter((c) => {
      const inTab = tab === "available" ? c.coverageStatus === "Available" : c.coverageStatus !== "Available";
      const inMonth = month === "All" || c.month === month;
      const inStatus = status === "All" || c.coverageStatus === status;
      return inTab && inMonth && inStatus;
    });
  }, [coverage, tab, month, status]);

  return (
    <div className="flex h-full flex-col">
      <AppBar
        title="Coverage Board"
        subtitle="Available & taken requests"
        action={
          <button
            onClick={() => navigate("coverage-records")}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-white/5"
          >
            History
          </button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
        {/* Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["available", "taken"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
                tab === t ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500"
              }`}
            >
              {t === "available" ? "Available" : "Taken / Active"}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white">
            <option value="All">All months</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as CoverageStatus | "All")}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="swap" title="No coverage requests" subtitle="Try a different filter or tab." />
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const isOwn = c.requesterId === profile.employeeId;
              const isMine = c.coveredById === profile.employeeId;
              return (
                <Card key={c.id}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                        <Icon name={c.coverageType === "Tech Issue" ? "wrench" : c.coverageType === "Leave" ? "umbrella" : "bolt"} size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.requesterName}</p>
                        <p className="text-xs text-slate-400">{c.position}</p>
                      </div>
                    </div>
                    <StatusBadge status={c.coverageStatus} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <Meta label="Date" value={c.coverageDate} />
                    <Meta label="Time" value={c.coverageTime} />
                    <Meta label="Hours" value={`${c.forCoverageHours}h`} />
                  </div>
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-300">
                    {c.reason}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge>{c.coverageType}</Badge>
                    {c.takenBy && <Badge tone="sky">Taken by {c.takenBy}</Badge>}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    {c.coverageStatus === "Available" && (
                      isOwn ? (
                        <span className="flex-1 rounded-xl bg-slate-100 py-2 text-center text-xs font-semibold text-slate-400 dark:bg-white/5">
                          Your own request
                        </span>
                      ) : (
                        <Button full variant="tonal" icon="swap" onClick={() => setConfirm({ kind: "take", req: c })}>
                          Take over
                        </Button>
                      )
                    )}
                    {c.coverageStatus === "Ongoing" && isMine && (
                      <Button full variant="secondary" icon="x" onClick={() => setConfirm({ kind: "cancel", req: c })}>
                        Cancel coverage
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "take" ? "Take over coverage" : "Cancel coverage"}
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirm(null)}>Back</Button>
            <Button
              full
              variant={confirm?.kind === "cancel" ? "danger" : "primary"}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "take") takeoverCoverage(confirm.req.id);
                else cancelCoverage(confirm.req.id);
                setConfirm(null);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        {confirm?.kind === "take" ? (
          <p>Take over <b>{confirm.req.requesterName}</b>'s coverage on {confirm.req.coverageDate} ({confirm.req.forCoverageHours}h)? Status will change to <b>Ongoing</b>.</p>
        ) : (
          <p>Cancel this ongoing coverage? It will return to <b>Available</b> and clear takeover data.</p>
        )}
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-white/10">
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}
