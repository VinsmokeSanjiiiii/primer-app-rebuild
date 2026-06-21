import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icon";

export function Notifications() {
  const { notifications, markNotificationRead, deleteNotification } = useApp();
  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markAllAsRead = () => {
    notifications.forEach((n) => {
      if (!n.readAt) markNotificationRead(n.id);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar
        title="Notifications"
        subtitle={`Inbox • ${unreadCount} unread`}
        action={
          unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="rounded-full px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-white/5"
            >
              Mark all read
            </button>
          )
        }
      />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-6 pt-4">
        {sorted.length === 0 ? (
          <EmptyState icon="bell" title="No notifications" />
        ) : (
          sorted.map((n) => (
            <Card
              key={n.id}
              onClick={() => { if (!n.readAt) markNotificationRead(n.id); }}
              className={!n.readAt ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/30 dark:bg-indigo-500/10" : ""}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Icon name="bell" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{n.title}</p>
                    {!n.readAt && <Badge tone="indigo">New</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-300">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {n.readAt && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                    className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition"
                    title="Delete notification"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
