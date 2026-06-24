import { useEffect } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Badge, EmptyState, Field } from "../components/ui";
import { Icon } from "../components/Icon";
import { openExternal } from "../lib/openExternal";

const SEEN_INFRACTIONS_KEY = "primer_seen_infractions";

export function Infractions() {
  const { infractions, profile } = useApp();
  const mine = infractions.filter((i) => i.employeeId === profile.employeeId);
  const totalLost = mine.reduce((s, i) => s + i.lostMinutes, 0);

  // Mark all currently loaded infractions as seen when the user opens this screen.
  // Dashboard reads this key to compute the unseen badge count.
  useEffect(() => {
    if (mine.length === 0) return;
    try {
      const ids = mine.map((i) => i.id);
      localStorage.setItem(SEEN_INFRACTIONS_KEY, JSON.stringify(ids));
    } catch { /* ignore */ }
  }, [mine]);

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Infractions" subtitle="Your record" />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6 pt-4">
        {mine.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3 text-white">
            <div>
              <p className="text-xs text-white/80">Total minutes lost</p>
              <p className="text-2xl font-black">{totalLost}</p>
            </div>
            <Badge tone="rose">{mine.length} infractions</Badge>
          </div>
        )}
        {mine.length === 0 ? (
          <EmptyState icon="shield" title="No infractions" subtitle="Keep up the great record!" />
        ) : (
          mine.map((i) => (
            <Card key={i.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                    <Icon name="alert" size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{i.infractionType}</p>
                    <p className="text-xs text-slate-400">{i.infractionDate}</p>
                  </div>
                </div>
                <Badge tone="rose">{i.lostMinutes} min</Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {i.infractionId && <Field label="Infraction ID" value={i.infractionId} />}
                {i.daysOff && <Field label="Days Off" value={i.daysOff} />}
                {i.phoneName && <Field label="Phone Name" value={i.phoneName} />}
                {i.schedule && <Field label="Schedule" value={i.schedule} />}
                {i.month && <Field label="Month" value={i.month} />}
                {i.year !== undefined && <Field label="Year" value={String(i.year)} />}
              </div>

              {i.notes && (
                <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-300">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Notes</p>
                  <p className="mt-1">{i.notes}</p>
                </div>
              )}

              {i.driveLink && (
                <button
                  type="button"
                  onClick={() => { void openExternal(i.driveLink!); }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition active:scale-95 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                >
                  <Icon name="download" size={14} />
                  View attachment
                </button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
