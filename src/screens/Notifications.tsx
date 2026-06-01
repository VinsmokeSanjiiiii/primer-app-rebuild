import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";

export function Notifications() {
  const { notifications, markNotificationRead } = useApp();
  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Notifications" subtitle="Inbox" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6 pt-4">
        {sorted.length === 0 ? (
          <EmptyState icon="bell" title="No notifications" />
        ) : (
          sorted.map((n) => (
            <Card key={n.id} onClick={() => markNotificationRead(n.id)}
              className={!n.readAt ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/30 dark:bg-indigo-500/10" : ""}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Icon name="bell" size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{n.title}</p>
                    {!n.readAt && <Badge tone="indigo">New</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-300">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
