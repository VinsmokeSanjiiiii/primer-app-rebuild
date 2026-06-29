import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import { DateFilter } from "../components/DateFilter";
import { StatusBadge } from "./Dashboard";
import { serverNow, parseDate, fmtDate, startOfDay, currentServerMonth, currentServerYear } from "../lib/date";
import type { CoverageRequest } from "../types";

const ITEMS_PER_PAGE = 10;

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
  return 99; // unknown
}

/**
 * Grab eligibility rules:
 *  Supervisor (0)       → can grab all (rank 0–4)
 *  Inbound (1)          → can grab Inbound + Lima Delta Expert + Delta Expert + Tango (rank 1–4)
 *  Lima Delta Expert(2) → can grab Lima Delta Expert + Delta Expert + Tango (rank 2–4)
 *  Delta Expert (3)     → can grab Delta Expert + Tango (rank 3–4)
 *  Tango (4)            → can grab Tango only (rank 4)
 */
function canGrabCoverage(profilePosition: string, recordPosition: string): boolean {
  const myRank = rankOf(profilePosition);
  const recRank = rankOf(recordPosition);
  // Supervisor grabs all
  if (myRank === 0) return true;
  // Others can only grab records at their own rank or lower (higher number = lower position)
  return recRank >= myRank;
}

/** Sort score for Available tab: 0 = grabbable, 1 = past, 2 = ungrabbable/own */
function grabSortScore(
  c: CoverageRequest,
  profileEmployeeId: string,
  profilePosition: string,
  today: Date,
): number {
  const isOwn = c.requesterId === profileEmployeeId;
  const isPast = parseDate(c.coverageDate) < today;
  const eligible = canGrabCoverage(profilePosition, c.position ?? "");

  if (!isOwn && !isPast && eligible) return 0; // grabbable
  if (isPast) return 1;                         // past date
  return 2;                                     // ungrabbable (own or ineligible)
}

type Tab = "available" | "ongoing" | "completed";

export function Coverage() {
  const { coverage, coveredby, profile, takeoverCoverage, cancelCoverage } = useApp();

  const FILTER_YEARS = useMemo(() => buildYears(), []);

  const [tab, setTab] = useState<Tab>("available");
  const [month, setMonth] = useState(() => currentServerMonth());
  const [year, setYear] = useState(() => String(currentServerYear()));
  const [completedMonth, setCompletedMonth] = useState(() => currentServerMonth());
  const [completedYear, setCompletedYear] = useState(() => String(currentServerYear()));
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: "take" | "cancel"; req: CoverageRequest } | null>(null);

  const today = startOfDay(serverNow());

  // ── Available (from CoverageList only, deduplicated, sorted) ──────────────
  const availableAll = useMemo(() => {
    const seen = new Set<string>();
    const filtered = coverage.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      const byStatus = c.coverageStatus === "Available";
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      return byStatus && byMonth && byYear;
    });

    // Sort: grabbable (ascending) → past (ascending) → ungrabbable (ascending)
    return filtered.sort((a, b) => {
      const sa = grabSortScore(a, profile.employeeId, profile.position ?? "", today);
      const sb = grabSortScore(b, profile.employeeId, profile.position ?? "", today);
      if (sa !== sb) return sa - sb;
      return parseDate(a.coverageDate).getTime() - parseDate(b.coverageDate).getTime();
    });
  }, [coverage, month, year, profile.employeeId, profile.position, today]);

  const availablePage = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return availableAll.slice(start, start + ITEMS_PER_PAGE);
  }, [availableAll, page]);

  const totalPages = Math.max(1, Math.ceil(availableAll.length / ITEMS_PER_PAGE));

  // ── Ongoing (from Coveredby node — current user's records) ────────────────
  const ongoingList = useMemo(() => {
    return coveredby.filter((c) => {
      const byUser = c.coveredById === profile.employeeId;
      const byStatus = c.coverageStatus === "Ongoing";
      const byMonth = month === "All" || c.month === month;
      const byYear = year === "All" || String(c.year) === year;
      return byUser && byStatus && byMonth && byYear;
    });
  }, [coveredby, profile.employeeId, month, year]);

  // ── Completed (from Coveredby node — current user's records only) ─────────
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
        (a, b) =>
          parseDate(a.coverageDate).getTime() - parseDate(b.coverageDate).getTime(),
      );
  }, [coveredby, profile.employeeId, completedMonth, completedYear]);

  const handleMonthChange = (v: string) => { setMonth(v); setPage(0); };
  const handleYearChange = (v: string) => { setYear(v); setPage(0); };

  const renderCard = (c: CoverageRequest) => {
    const isOwn = c.requesterId === profile.employeeId;
    const isMine = c.coveredById === profile.employeeId;
    const isPastDate = parseDate(c.coverageDate) < today;
    const canGrab = canGrabCoverage(profile.position ?? "", c.position ?? "");

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
          <Meta
            label="Date"
            value={tab === "completed" ? fmtDate(parseDate(c.coverageDate)) : c.coverageDate}
            isPast={isPastDate && tab !== "completed"}
          />
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
          {isOwn && tab === "available" && <Badge tone="amber">Your request</Badge>}
          {isMine && tab === "completed" && <Badge tone="green">You covered</Badge>}
        </div>

        {/* Actions */}
        {tab === "available" && (
          <div className="mt-3">
            {isOwn ? (
              <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
                Your own request
              </span>
            ) : !canGrab ? (
              <div className="flex w-full flex-col items-center gap-1 rounded-xl bg-slate-100 py-2 dark:bg-white/5">
                <span className="text-xs font-semibold text-slate-400">Invalid Specialization</span>
                {isPastDate && (
                  <span className="text-xs font-semibold text-slate-400">· Past date</span>
                )}
              </div>
            ) : isPastDate ? (
              <span className="flex w-full items-center justify-center rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-white/5">
                Past date
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

        {/* Month/Year filter — Available and Ongoing tabs */}
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

        {/* Month/Year filter — Completed tab */}
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
            <EmptyState icon="shield" title="No completed coverage" subtitle="No completed records found for the selected period." />
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
