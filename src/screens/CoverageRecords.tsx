import { useMemo } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Badge, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { StatusBadge } from "./Dashboard";
import { parseDate } from "../lib/date";

export function CoverageRecords() {
  const { coverage, profile } = useApp();

  const mine = useMemo(
    () =>
      coverage
        .filter((c) => c.coveredById === profile.employeeId)
        .sort((a, b) => parseDate(b.coverageDate).getTime() - parseDate(a.coverageDate).getTime()),
    [coverage, profile.employeeId],
  );

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Coverage Records" subtitle="Your coverage history" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6 pt-4">
        {mine.length === 0 ? (
          <EmptyState icon="swap" title="No coverage history" subtitle="Coverage you take over will appear here." />
        ) : (
          mine.map((c) => (
            <Card key={c.id} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Icon name={c.coverageType === "Tech Issue" ? "wrench" : "swap"} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{c.requesterName}</p>
                <p className="truncate text-xs text-slate-400">{c.coverageDate} · {c.coverageTime} · {c.coveredHours ?? c.forCoverageHours}h</p>
                <Badge tone="slate">{c.coverageType}</Badge>
              </div>
              <StatusBadge status={c.coverageStatus} />
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
