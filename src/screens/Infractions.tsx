import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Badge, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";

export function Infractions() {
  const { infractions, profile } = useApp();
  const mine = infractions.filter((i) => i.employeeId === profile.employeeId);
  const totalLost = mine.reduce((s, i) => s + i.lostMinutes, 0);

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
              {i.notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-300">{i.notes}</p>}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
