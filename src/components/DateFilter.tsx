import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { MONTHS } from "../lib/date";
import { cn } from "../utils/cn";

interface DateFilterProps {
  month: string; // "All" or month name
  year: string;  // "All" or year string
  years: string[];
  onMonthChange: (m: string) => void;
  onYearChange: (y: string) => void;
  /** Optional "Today" reset handler — when provided, a chip is rendered. */
  onReset?: () => void;
  className?: string;
}

/**
 * Modern month/year filter. Replaces the legacy pair of <select> elements
 * with a segmented stepper + popover picker. Pure presentation — emits the
 * same {month, year} shape ("All" sentinel preserved) as before.
 */
export function DateFilter({
  month,
  year,
  years,
  onMonthChange,
  onYearChange,
  onReset,
  className,
}: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Stepper: only enabled when a specific month + year is selected
  const canStep = month !== "All" && year !== "All";
  const monthIdx = MONTHS.indexOf(month);

  const step = (dir: -1 | 1) => {
    if (!canStep) return;
    let mi = monthIdx + dir;
    let y = Number(year);
    if (mi < 0) { mi = 11; y -= 1; }
    else if (mi > 11) { mi = 0; y += 1; }
    const ys = String(y);
    onMonthChange(MONTHS[mi]);
    if (years.includes(ys)) onYearChange(ys);
  };

  const label =
    month === "All" && year === "All"
      ? "All dates"
      : month === "All"
        ? `All months · ${year}`
        : year === "All"
          ? `${month} · all years`
          : `${month} ${year}`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canStep}
          aria-label="Previous month"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <Icon name="back" size={18} />
        </button>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5"
        >
          <Icon name="calendar" size={16} />
          <span className="truncate">{label}</span>
          <Icon name="chevron" size={14} />
        </button>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canStep}
          aria-label="Next month"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <Icon name="chevron" size={18} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 origin-top rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-fade-in-down dark:border-white/10 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Filter by period
            </p>
            {onReset && (
              <button
                type="button"
                onClick={() => { onReset(); setOpen(false); }}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                Today
              </button>
            )}
          </div>

          {/* Year row */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip active={year === "All"} onClick={() => onYearChange("All")}>All years</Chip>
            {years.map((y) => (
              <Chip key={y} active={year === y} onClick={() => onYearChange(y)}>{y}</Chip>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onMonthChange("All")}
              className={cn(
                "col-span-3 rounded-xl px-2 py-1.5 text-xs font-semibold transition",
                month === "All"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
              )}
            >
              All months
            </button>
            {MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMonthChange(m)}
                className={cn(
                  "rounded-xl px-2 py-2 text-xs font-semibold transition",
                  month === m
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                )}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold transition",
        active
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
