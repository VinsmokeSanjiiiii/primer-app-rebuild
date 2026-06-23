import { useState } from "react";
import { cn } from "../utils/cn";
import { IconButton } from "./ui";
import {
  buildMonthGrid,
  MONTHS,
  WEEKDAYS,
  fmtDate,
  sameDay,
  startOfDay,
  serverNow,
} from "../lib/date";

interface CalendarProps {
  selected: string[]; // M/d/yyyy
  onToggle: (date: string) => void;
  /** returns reason string if the date should be disabled */
  disabledReason?: (d: Date) => string | null;
  /** dates marked as holidays (M/d/yyyy) */
  holidays?: string[];
  /** dates already requested (M/d/yyyy) */
  requested?: string[];
  single?: boolean;
}

export function Calendar({
  selected,
  onToggle,
  disabledReason,
  holidays = [],
  requested = [],
  single,
}: CalendarProps) {
  const today = startOfDay(serverNow());
  const [view, setView] = useState(() => ({
    y: today.getFullYear(),
    m: today.getMonth(),
  }));

  const grid = buildMonthGrid(view.y, view.m);

  const prev = () =>
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }));
  const next = () =>
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/40">
      <div className="mb-2 flex items-center justify-between px-1">
        <IconButton name="back" onClick={prev} />
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {MONTHS[view.m]} {view.y}
        </span>
        <IconButton name="chevron" onClick={next} />
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div key={`${view.y}-${view.m}`} className="grid grid-cols-7 gap-1 animate-fade-in">
        {grid.map((d, i) => {
          if (!d) return <span key={i} />;
          const ds = fmtDate(d);
          const isSel = selected.includes(ds);
          const isToday = sameDay(d, today);
          const isHoliday = holidays.includes(ds);
          const isRequested = requested.includes(ds);
          const reason = disabledReason ? disabledReason(d) : null;
          const disabled = !!reason || isHoliday || isRequested;
          return (
            <button
              key={i}
              disabled={disabled}
              title={reason || (isHoliday ? "Holiday" : isRequested ? "Already requested" : "")}
              onClick={() => !disabled && onToggle(ds)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 ease-out active:scale-90",
                isSel
                  ? "bg-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/30 animate-pop"
                  : "text-slate-700 hover:bg-indigo-50 hover:scale-105 dark:text-slate-200 dark:hover:bg-white/5",
                disabled &&
                  "cursor-not-allowed text-slate-300 line-through hover:bg-transparent hover:scale-100 dark:text-slate-600",
                isHoliday && !isSel && "text-rose-400",
                isToday && !isSel && "ring-2 ring-indigo-400 ring-offset-2",
              )}
            >
              {d.getDate()}
              {isHoliday && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-rose-400" />
              )}
              {isRequested && !isHoliday && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 px-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" />Holiday</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />Requested</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full ring-1 ring-indigo-400" />Today</span>
        {single && <span>· Single day only</span>}
      </div>
    </div>
  );
}
