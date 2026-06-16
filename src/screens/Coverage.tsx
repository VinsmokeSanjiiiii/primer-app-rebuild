import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import { StatusBadge } from "./Dashboard";
import { MONTHS, serverNow, parseDate, startOfDay, currentServerMonth, currentServerYear } from "../lib/date";
import type { CoverageRequest } from "../types";

const ITEMS_PER_PAGE = 10;

function buildYears(): string[] {
  const curr = currentServerYear();
  const base = [2024, 2025, 2026];
  if (!base.includes(curr)) base.push(curr);
  base.sort((a, b) => a - b);
  return base.map(String);
}

// Team-based grab rules
function canGrabCoverage(profileTeam: string, requesterTeam: string): boolean {
  const team = profileTeam.toLowerCase();
  const reqTeam = requesterTeam.toLowerCase();

  if (team.includes("delta-expert") || team.includes("delta expert"))
    return reqTeam.includes("delta");
  if (team.includes("lima-delta-expert") || team.includes("lima delta expert"))
    return reqTeam.includes("lima");
  if (team.includes("inbound"))
    return reqTeam.includes("inbound");
  if (team.includes("supervisor") || team.includes("sup") || team.includes("lead"))
    return true;

  return team === reqTeam;
}

type Tab = "available" | "ongoing" | "completed";

export function Coverage() {
  const { coverage, profile, takeoverCoverage, cancelCoverage, navigate } = useApp();

  const FILTER_YEARS = useMemo(() => buildYears(), []);

  const [tab, setTab] = useState<Tab>("available");
  // Available & Ongoing share a month/year filter, auto-init to current server month/year
  const [month, setMonth] = useState(() => currentServerMonth());
  const [year, setYear] = useState(() => String(currentServerYear()));
  // Completed mine-only toggle
  const [mineOnly, setMineOnly] = useState(false);
  // Available pagination
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: "take" | "cancel"; req: CoverageRequest } | null>(null);

  const today = startOfDay(serverNow());

  // ── Available ────────────────────────────────────────────────────────────
  const availableAll = useMemo(() => {
    return coverage.filter((c) => {
      const byStatus = c.coverageStatus === "Available";
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      return byStatus && byMonth && byYear;
    });
  }, [coverage, month, year]);

  const availablePage = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return availableAll.slice(start, start + ITEMS_PER_PAGE);
  }, [availableAll, page]);

  const totalPages = Math.max(1, Math.ceil(availableAll.length / ITEMS_PER_PAGE));

  // ── Ongoing (current user's) ──────────────────────────────────────────────
  const ongoingList = useMemo(() => {
    return coverage.filter((c) => {
      const byStatus = c.coverageStatus === "Ongoing";
      const byUser = c.coveredById === profile.employeeId;
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      return byStatus && byUser && byMonth && byYear;
    });
  }, [coverage, profile.employeeId, month, year]);

  // ── Completed ────────────────────────────────────────────────────────────
  const completedList = useMemo(() => {
    const base = coverage.filter((c) => c.coverageStatus === "Completed");
    const mine = mineOnly
      ? base.filter(
          (c) =>
            c.requesterId === profile.employeeId ||
            c.coveredById === profile.employeeId,
        )
      : base;
    return [...mine].sort(
      (a, b) =>
        parseDate(b.coverageDate).getTime() - parseDate(a.coverageDate).getTime(),
    );
  }, [coverage, profile.employeeId, mineOnly]);

  // Reset page when filters change
  const handleMonthChange = (v: string) => { setMonth(v); setPage(0); };
  const handleYearChange = (v: string) => { setYear(v); setPage(0); };

  const renderCard = (c: CoverageRequest) => {
    const isOwn = c.requesterId === profile.employeeId;
    const isMine = c.coveredById === profile.employeeId;
    const isPastDate = parseDate(c.coverageDate) < today;
    const canGrab = canGrabCoverage(profile.team, c.team || "");

    return (
      <Card key={c.id} className={isPastDate && tab !== "completed" ? "opacity-60" : ""}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Icon
                name={
                  c.coverageType === "Tech Issue"
                    ? "wrench"
                    : c.coverageType === "Leave"
                    ? "umbrella"
                    : "bolt"
                }
                size={16}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.requesterName}</p>
              <p className="text-xs text-slate-400">{c.position}</p>
            </div>
          </div>
          <StatusBadge status={c.coverageStatus} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Meta label="Date" value={c.coverageDate} isPast={isPastDate && tab !== "completed"} />
          <Meta label="Time" value={c.coverageTime} />
          <Meta label="Hours" value={`${c.forCoverageHours}h`} />
        </div>

        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-300">
          {c.reason}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge>{c.coverageType}</Badge>
          {c.takenBy && <Badge tone="sky">Taken by {c.takenBy}</Badge>}
          {isPastDate && tab !== "completed" && <Badge tone="slate">Past</Badge>}
          {isOwn && <Badge tone="amber">Your request</Badge>}
          {isMine && tab === "completed" && <Badge tone="green">You covered</Badge>}
        </div>

        {/* Actions */}
        {tab === "available" && (
          <div className="mt-3">
            {isOwn ? (
              <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
                Your own request
              </span>
            ) : isPastDate ? (
              <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
                Past date
              </span>
            ) : !canGrab ? (
              <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
                Different team
              </span>
            ) : (
              <Button full variant="tonal" icon="swap" onClick={() => setConfirm({ kind: "take", req: c })}>
                Grab
              </Button>
            )}
          </div>
        )}

        {tab === "ongoing" && isMine && (
          <Button full variant="secondary" icon="x" className="mt-3"
            onClick={() => setConfirm({ kind: "cancel", req: c })}>
            Cancel coverage
          </Button>
        )}
      </Card>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar
        title="Coverage Board"
        subtitle="Available, ongoing & completed"
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">

        {/* Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["available", "ongoing", "completed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition ${
                tab === t
                  ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300"
                  : "text-slate-500"
              }`}
            >
              {t === "available"
                ? `Available (${availableAll.length})`
                : t === "ongoing"
                ? `Ongoing (${ongoingList.length})`
                : `Completed (${completedList.length})`}
            </button>
          ))}
        </div>

        {/* Month/Year filter — shown on Available and Ongoing */}
        {tab !== "completed" && (
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
            >
              <option value="All">All months</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
            >
              <option value="All">All years</option>
              {FILTER_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {/* Completed: All / Mine toggle */}
        {tab === "completed" && (
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            <button
              onClick={() => setMineOnly(false)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                !mineOnly ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500"
              }`}
            >
              All completed
            </button>
            <button
              onClick={() => setMineOnly(true)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                mineOnly ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500"
              }`}
            >
              My records
            </button>
          </div>
        )}

        {/* Content */}
        {tab === "available" && (
          <>
            {availableAll.length === 0 ? (
              <EmptyState icon="swap" title="No available coverage" subtitle="No requests for the selected period." />
            ) : (
              <>
                <div className="space-y-2">{availablePage.map(renderCard)}</div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="secondary"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-slate-400">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "ongoing" && (
          ongoingList.length === 0 ? (
            <EmptyState icon="swap" title="No ongoing coverage" subtitle="No records assigned to you for the selected period." />
          ) : (
            <div className="space-y-2">{ongoingList.map(renderCard)}</div>
          )
        )}

        {tab === "completed" && (
          completedList.length === 0 ? (
            <EmptyState icon="shield" title="No completed coverage" subtitle={mineOnly ? "No completed records linked to you." : "No completed records found."} />
          ) : (
            <div className="space-y-2">{completedList.map(renderCard)}</div>
          )
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
          <p>
            Take over <b>{confirm.req.requesterName}</b>'s coverage on {confirm.req.coverageDate}{" "}
            ({confirm.req.forCoverageHours}h)? Status will change to <b>Ongoing</b>.
          </p>
        ) : (
          <p>Cancel this ongoing coverage? It will return to <b>Available</b> and clear takeover data.</p>
        )}
      </Dialog>
    </div>
  );
}

function Meta({ label, value, isPast }: { label: string; value: string; isPast?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 dark:border-white/10 ${
        isPast ? "border-slate-300 bg-slate-50 dark:bg-white/5" : "border-slate-200"
      }`}
    >
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className={`font-semibold ${isPast ? "text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>{value}</p>
    </div>
  );
}
