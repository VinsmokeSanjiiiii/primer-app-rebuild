import { useMemo, useState, useEffect, useCallback } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import { DateFilter } from "../components/DateFilter";
import { StatusBadge } from "./Dashboard";
import {
  serverNow,
  serverNowMs,
  parseDate,
  fmtDate,
  startOfDay,
  currentServerMonth,
  currentServerYear,
} from "../lib/date";
import type { CoverageRequest } from "../types";

const ITEMS_PER_PAGE = 10;
const MIN_COVERAGE_SECS = 3600; // 1 hour minimum before Finish is enabled

function buildYears(): string[] {
  const curr = currentServerYear();
  const base = [2024, 2025, 2026];
  if (!base.includes(curr)) base.push(curr);
  base.sort((a, b) => a - b);
  return base.map(String);
}

// Position hierarchy (highest = 0, lowest = 4)
const POSITION_RANK: Record<string, number> = {
  supervisor: 0,
  inbound: 1,
  "lima delta expert": 2,
  "delta expert": 3,
  tango: 4,
};

function rankOf(pos: string): number {
  const lower = pos.toLowerCase().trim();
  for (const [key, rank] of Object.entries(POSITION_RANK)) {
    if (lower.includes(key)) return rank;
  }
  return 99;
}

function canGrabCoverage(profilePosition: string, recordPosition: string): boolean {
  const myRank = rankOf(profilePosition);
  const recRank = rankOf(recordPosition);
  if (myRank === 0) return true;
  return recRank >= myRank;
}

function grabSortScore(
  c: CoverageRequest,
  profileEmployeeId: string,
  profilePosition: string,
  today: Date,
  grabbedIds: Set<string | undefined>,
): number {
  const isOwn = c.requesterId === profileEmployeeId;
  const isPast = parseDate(c.coverageDate) < today;
  const eligible = canGrabCoverage(profilePosition, c.position ?? "");
  const alreadyGrabbed = grabbedIds.has(c.id);

  if (!isOwn && !isPast && eligible && !alreadyGrabbed) return 0;
  if (isPast) return 1;
  return 2;
}

/** Format elapsed seconds as HH:MM:SS */
function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Compute elapsed seconds from a start timestamp to now (server-synced). */
function elapsedSecs(startTs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startTs) / 1000));
}

type Tab = "available" | "ongoing" | "completed";

type ConfirmState =
  | { kind: "take"; req: CoverageRequest }
  | { kind: "cancel"; req: CoverageRequest }
  | { kind: "finish"; req: CoverageRequest; coveredSecs: number };

export function Coverage() {
  const { coverage, coveredby, profile, takeoverCoverage, cancelCoverage, finishCoverage } =
    useApp();

  const FILTER_YEARS = useMemo(() => buildYears(), []);

  const [tab, setTab] = useState<Tab>("available");
  const [month, setMonth] = useState(() => currentServerMonth());
  const [year, setYear] = useState(() => String(currentServerYear()));
  const [completedMonth, setCompletedMonth] = useState(() => currentServerMonth());
  const [completedYear, setCompletedYear] = useState(() => String(currentServerYear()));
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // ── Real-time clock tick ───────────────────────────────────────────────────
  // We tick every second only while there are Ongoing records to avoid
  // unnecessary re-renders when the user is on other tabs.
  const [nowMs, setNowMs] = useState(() => serverNowMs());
  useEffect(() => {
    const id = setInterval(() => setNowMs(serverNowMs()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = startOfDay(serverNow());

  // ── Set of coverage IDs already grabbed (Ongoing) by current user ─────────
  const myGrabbedOrigIds = useMemo<Set<string | undefined>>(() => {
    return new Set(
      coveredby
        .filter(
          (c) =>
            c.coveredById === profile.employeeId && c.coverageStatus === "Ongoing",
        )
        .map((c) => c.originalCoverageId),
    );
  }, [coveredby, profile.employeeId]);

  // ── Available (from CoverageList — hide records the current user already grabbed) ──
  const availableAll = useMemo(() => {
    const seen = new Set<string>();
    const filtered = coverage.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      const byStatus = c.coverageStatus === "Available";
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      // Hide records this user has already grabbed
      const notYetGrabbed = !myGrabbedOrigIds.has(c.id);
      return byStatus && byMonth && byYear && notYetGrabbed;
    });

    return filtered.sort((a, b) => {
      const sa = grabSortScore(a, profile.employeeId, profile.position ?? "", today, myGrabbedOrigIds);
      const sb = grabSortScore(b, profile.employeeId, profile.position ?? "", today, myGrabbedOrigIds);
      if (sa !== sb) return sa - sb;
      return parseDate(a.coverageDate).getTime() - parseDate(b.coverageDate).getTime();
    });
  }, [coverage, month, year, profile.employeeId, profile.position, today, myGrabbedOrigIds]);

  const availablePage = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return availableAll.slice(start, start + ITEMS_PER_PAGE);
  }, [availableAll, page]);

  const totalPages = Math.max(1, Math.ceil(availableAll.length / ITEMS_PER_PAGE));

  // ── Ongoing (Coveredby records for this user) ─────────────────────────────
  const ongoingList = useMemo(() => {
    return coveredby.filter((c) => {
      const byUser = c.coveredById === profile.employeeId;
      const byStatus = c.coverageStatus === "Ongoing";
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      return byUser && byStatus && byMonth && byYear;
    });
  }, [coveredby, profile.employeeId, month, year]);

  // ── Completed (Coveredby records for this user) ───────────────────────────
  const completedList = useMemo(() => {
    return coveredby
      .filter((c) => {
        const byUser = c.coveredById === profile.employeeId;
        const byStatus = c.coverageStatus === "Completed";
        const byMonth = completedMonth === "All" || c.month === completedMonth;
        const byYear = completedYear === "All" || String(c.year) === completedYear;
        return byUser && byStatus && byMonth && byYear;
      })
      .sort(
        (a, b) => parseDate(a.coverageDate).getTime() - parseDate(b.coverageDate).getTime(),
      );
  }, [coveredby, profile.employeeId, completedMonth, completedYear]);

  const handleMonthChange = (v: string) => {
    setMonth(v);
    setPage(0);
  };
  const handleYearChange = (v: string) => {
    setYear(v);
    setPage(0);
  };

  const handleConfirm = useCallback(() => {
    if (!confirm) return;
    if (confirm.kind === "take") {
      takeoverCoverage(confirm.req.id);
    } else if (confirm.kind === "cancel") {
      cancelCoverage(confirm.req.id);
    } else if (confirm.kind === "finish") {
      const hrs = Math.max(1, Math.round((confirm.coveredSecs / 3600) * 10) / 10);
      finishCoverage(confirm.req.id, hrs);
    }
    setConfirm(null);
  }, [confirm, takeoverCoverage, cancelCoverage, finishCoverage]);

  // ── Available card ─────────────────────────────────────────────────────────
  const renderAvailableCard = (c: CoverageRequest) => {
    const isOwn = c.requesterId === profile.employeeId;
    const isPastDate = parseDate(c.coverageDate) < today;
    const canGrab = canGrabCoverage(profile.position ?? "", c.position ?? "");
    const grabbable = !isOwn && !isPastDate && canGrab;

    return (
      <Card key={c.id} className={isPastDate ? "opacity-60" : ""}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Icon
                name={
                  c.coverageType === "Tech Issue"
                    ? "wrench"
                    : c.coverageType?.toLowerCase().includes("leave")
                    ? "umbrella"
                    : "bolt"
                }
                size={16}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {c.requesterName}
              </p>
              <p className="text-xs text-slate-400">{c.position}</p>
            </div>
          </div>
          <StatusBadge status={c.coverageStatus} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Meta label="Date" value={c.coverageDate} isPast={isPastDate} />
          <Meta label="Time" value={c.coverageTime} />
          <Meta label="Hours Needed" value={`${c.forCoverageHours}h`} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Meta label="Team" value={c.team} />
          <Meta label="Days Off" value={c.daysOff} />
        </div>

        {c.reason ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-300">
            {c.reason}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge>{c.coverageType}</Badge>
          {isPastDate && <Badge tone="slate">Past</Badge>}
          {isOwn && <Badge tone="amber">Your request</Badge>}
        </div>

        <div className="mt-3">
          {isOwn ? (
            <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
              Your own request
            </span>
          ) : !canGrab ? (
            <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
              Invalid specialization
            </span>
          ) : isPastDate ? (
            <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
              Past date
            </span>
          ) : (
            <Button
              full
              variant="tonal"
              icon="swap"
              onClick={() => setConfirm({ kind: "take", req: c })}
            >
              Grab Coverage
            </Button>
          )}
        </div>
      </Card>
    );
  };

  // ── Ongoing card ──────────────────────────────────────────────────────────
  const renderOngoingCard = (c: CoverageRequest) => {
    const secs = c.coverageStartTs ? elapsedSecs(c.coverageStartTs, nowMs) : 0;
    const progressPct = Math.min(100, (secs / MIN_COVERAGE_SECS) * 100);
    const canFinish = secs >= MIN_COVERAGE_SECS;
    const minsRemaining = Math.max(0, Math.ceil((MIN_COVERAGE_SECS - secs) / 60));

    return (
      <Card key={c.id}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Icon name="clock" size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Coverage in Progress
              </p>
              <p className="text-xs text-slate-400">{c.coverageDate} · {c.coverageTime}</p>
            </div>
          </div>
          <StatusBadge status={c.coverageStatus} />
        </div>

        {/* Real-time elapsed timer */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Coverage time
          </span>
          <span className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">
            {fmtElapsed(secs)}
          </span>
        </div>

        {/* Progress bar toward 1-hour minimum */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Progress to minimum (1 hour)
            </span>
            <span
              className={`font-semibold ${
                canFinish ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
              }`}
            >
              {canFinish ? "Ready to finish!" : `${minsRemaining} min remaining`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                canFinish ? "bg-emerald-500" : "bg-indigo-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Meta label="Coverage Type" value={c.coverageType} />
          <Meta label="Hours Needed" value={`${c.forCoverageHours}h`} />
          <Meta label="Team" value={c.team} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Meta label="Schedule" value={c.coverageTime} />
          <Meta label="Days Off" value={c.daysOff} />
        </div>

        {/* Cancel + Finish buttons */}
        <div className="mt-3 flex gap-2">
          <Button
            full
            variant="secondary"
            icon="x"
            onClick={() => setConfirm({ kind: "cancel", req: c })}
          >
            Cancel
          </Button>

          <div className="relative flex-1 group">
            <Button
              full
              variant={canFinish ? "primary" : "secondary"}
              icon="check"
              disabled={!canFinish}
              onClick={() => {
                if (!canFinish) return;
                setConfirm({ kind: "finish", req: c, coveredSecs: secs });
              }}
            >
              Finish
            </Button>
            {!canFinish && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700">
                Finish unlocks after 1 hour of coverage. {minsRemaining} min left.
                <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  // ── Completed card ────────────────────────────────────────────────────────
  const renderCompletedCard = (c: CoverageRequest) => (
    <Card key={c.id}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Icon name="shield" size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Completed Coverage
            </p>
            <p className="text-xs text-slate-400">{fmtDate(parseDate(c.coverageDate))}</p>
          </div>
        </div>
        <StatusBadge status={c.coverageStatus} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Meta label="Date" value={fmtDate(parseDate(c.coverageDate))} />
        <Meta label="Time" value={c.coverageTime} />
        <Meta label="Hours Covered" value={`${c.coveredHours ?? 0}h`} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Meta label="Team" value={c.team} />
        <Meta label="Days Off" value={c.daysOff} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Badge>{c.coverageType}</Badge>
        <Badge tone="green">You covered</Badge>
      </div>
    </Card>
  );

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Coverage Board" subtitle="Available, ongoing & completed" />
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

        {/* Filters */}
        {tab !== "completed" && (
          <DateFilter
            month={month}
            year={year}
            years={FILTER_YEARS}
            onMonthChange={handleMonthChange}
            onYearChange={handleYearChange}
            onReset={() => {
              setMonth(currentServerMonth());
              setYear(String(currentServerYear()));
              setPage(0);
            }}
          />
        )}
        {tab === "completed" && (
          <DateFilter
            month={completedMonth}
            year={completedYear}
            years={FILTER_YEARS}
            onMonthChange={(v) => setCompletedMonth(v)}
            onYearChange={(v) => setCompletedYear(v)}
            onReset={() => {
              setCompletedMonth(currentServerMonth());
              setCompletedYear(String(currentServerYear()));
            }}
          />
        )}

        {/* Tab content */}
        {tab === "available" && (
          <>
            {availableAll.length === 0 ? (
              <EmptyState
                icon="swap"
                title="No available coverage"
                subtitle="No requests found for the selected period."
              />
            ) : (
              <>
                <div className="space-y-2">{availablePage.map(renderAvailableCard)}</div>
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

        {tab === "ongoing" &&
          (ongoingList.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No ongoing coverage"
              subtitle="Grab a coverage from the Available tab to get started."
            />
          ) : (
            <div className="space-y-3">{ongoingList.map(renderOngoingCard)}</div>
          ))}

        {tab === "completed" &&
          (completedList.length === 0 ? (
            <EmptyState
              icon="shield"
              title="No completed coverage"
              subtitle="No completed records found for the selected period."
            />
          ) : (
            <div className="space-y-2">{completedList.map(renderCompletedCard)}</div>
          ))}
      </div>

      {/* ── Grab confirmation dialog ──────────────────────────────────────── */}
      <Dialog
        open={confirm?.kind === "take"}
        onClose={() => setConfirm(null)}
        title="Grab Coverage"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button full variant="primary" onClick={handleConfirm}>
              Confirm Grab
            </Button>
          </>
        }
      >
        {confirm?.kind === "take" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You're about to take over this coverage. Please review the details below before
              confirming.
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 overflow-hidden">
              <DetailRow label="Employee" value={confirm.req.requesterName} />
              <DetailRow label="Position" value={confirm.req.position} />
              <DetailRow label="Team" value={confirm.req.team} />
              <DetailRow label="Coverage Date" value={confirm.req.coverageDate} />
              <DetailRow label="Coverage Time" value={confirm.req.coverageTime} />
              <DetailRow label="Coverage Type" value={confirm.req.coverageType} />
              <DetailRow label="Hours Required" value={`${confirm.req.forCoverageHours} hour(s)`} highlight />
              <DetailRow label="Days Off" value={confirm.req.daysOff} />
              {confirm.req.reason ? (
                <DetailRow label="Reason" value={confirm.req.reason} />
              ) : null}
            </div>
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              Once confirmed, this coverage will appear on your <strong>Ongoing</strong> tab and
              your coverage time will start immediately.
            </p>
          </div>
        )}
      </Dialog>

      {/* ── Cancel confirmation dialog ────────────────────────────────────── */}
      <Dialog
        open={confirm?.kind === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel Coverage"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button full variant="danger" onClick={handleConfirm}>
              Cancel Coverage
            </Button>
          </>
        }
      >
        {confirm?.kind === "cancel" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to cancel this ongoing coverage? This action cannot be
              undone.
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 overflow-hidden">
              <DetailRow label="Coverage Date" value={confirm.req.coverageDate} />
              <DetailRow label="Coverage Time" value={confirm.req.coverageTime} />
              <DetailRow label="Coverage Type" value={confirm.req.coverageType} />
              <DetailRow
                label="Time Elapsed"
                value={
                  confirm.req.coverageStartTs
                    ? fmtElapsed(elapsedSecs(confirm.req.coverageStartTs, nowMs))
                    : "—"
                }
              />
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Cancelling will remove this record from your Ongoing tab. The original request
              will remain Available for others to grab.
            </p>
          </div>
        )}
      </Dialog>

      {/* ── Finish confirmation dialog ────────────────────────────────────── */}
      <Dialog
        open={confirm?.kind === "finish"}
        onClose={() => setConfirm(null)}
        title="Finish Coverage"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button full variant="primary" onClick={handleConfirm}>
              Confirm Finish
            </Button>
          </>
        }
      >
        {confirm?.kind === "finish" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Great work! Please review your coverage summary before finishing.
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 overflow-hidden">
              <DetailRow label="Coverage Date" value={confirm.req.coverageDate} />
              <DetailRow label="Coverage Time" value={confirm.req.coverageTime} />
              <DetailRow label="Coverage Type" value={confirm.req.coverageType} />
              <DetailRow label="Team" value={confirm.req.team} />
              <DetailRow label="Position" value={confirm.req.position} />
              <DetailRow
                label="Total Time Covered"
                value={fmtElapsed(confirm.coveredSecs)}
                highlight
              />
              <DetailRow
                label="Hours to Log"
                value={`${Math.max(1, Math.round((confirm.coveredSecs / 3600) * 10) / 10)} hr(s)`}
                highlight
              />
            </div>
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              After finishing, this record will move to your <strong>Completed</strong> tab and
              the original coverage request will be updated accordingly.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Meta({
  label,
  value,
  isPast,
}: {
  label: string;
  value: string;
  isPast?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 dark:border-white/10 ${
        isPast ? "border-slate-300 bg-slate-50 dark:bg-white/5" : "border-slate-200"
      }`}
    >
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p
        className={`font-semibold truncate ${
          isPast ? "text-slate-400" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`text-xs font-semibold ${
          highlight
            ? "text-indigo-700 dark:text-indigo-300"
            : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
