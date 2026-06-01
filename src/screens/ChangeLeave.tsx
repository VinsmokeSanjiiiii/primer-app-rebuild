import { useMemo, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, EmptyState, Dialog } from "../components/ui";
import { Calendar } from "../components/Calendar";
import { StatusBadge } from "./Dashboard";
import { startOfDay, serverNow } from "../lib/date";

interface UnifiedItem {
  kind: "leave" | "ot";
  id: string;
  title: string;
  date: string;
  status: string;
}

export function ChangeLeave() {
  const { leaves, ot, changeLeaveDate, back } = useApp();
  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  const [confirmSel, setConfirmSel] = useState(false);
  const [newDate, setNewDate] = useState<string[]>([]);

  const items: UnifiedItem[] = useMemo(() => {
    const ls = leaves
      .filter((l) => l.status === "Approved" || l.status === "Declined")
      .map<UnifiedItem>((l) => ({ kind: "leave", id: l.id, title: l.leaveType, date: l.leaveDate.join(", "), status: l.status }));
    const os = ot
      .filter((o) => o.status === "Approved" || o.status === "Declined")
      .map<UnifiedItem>((o) => ({ kind: "ot", id: o.id, title: o.otType, date: o.otDate, status: o.status }));
    return [...ls, ...os];
  }, [leaves, ot]);

  const disabledReason = (d: Date) => (d < startOfDay(serverNow()) ? "Past date" : null);

  return (
    <div className="flex h-full flex-col">
      <AppBar title="Change Leave/OT Date" subtitle="Approved or declined requests" />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6 pt-4">
        {items.length === 0 ? (
          <EmptyState icon="swap" title="Nothing to change" subtitle="Only approved or declined requests are eligible." />
        ) : (
          items.map((it) => (
            <Card key={it.id} onClick={() => { setSelected(it); setConfirmSel(true); }}
              className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{it.title}</p>
                <p className="text-xs text-slate-400">{it.date}</p>
                <Badge tone="slate">{it.kind === "leave" ? "Leave" : "OT"}</Badge>
              </div>
              <StatusBadge status={it.status} />
            </Card>
          ))
        )}
      </div>

      {/* Confirm selection */}
      <Dialog
        open={confirmSel}
        onClose={() => setConfirmSel(false)}
        title="Change this request?"
        footer={
          <>
            <Button variant="secondary" full onClick={() => { setConfirmSel(false); setSelected(null); }}>No</Button>
            <Button full onClick={() => setConfirmSel(false)}>Pick new date</Button>
          </>
        }
      >
        <p>Change the date for <b>{selected?.title}</b> ({selected?.date})? Pick a new date next.</p>
      </Dialog>

      {/* Date picker */}
      <Dialog
        open={!!selected && !confirmSel}
        onClose={() => setSelected(null)}
        title="Select new date"
        footer={
          <>
            <Button variant="secondary" full onClick={() => setSelected(null)}>Cancel</Button>
            <Button full disabled={newDate.length === 0}
              onClick={() => {
                if (selected && newDate[0]) changeLeaveDate(selected.kind, selected.id, newDate[0]);
                setSelected(null);
                setNewDate([]);
                back();
              }}>
              Submit change
            </Button>
          </>
        }
      >
        <Calendar selected={newDate} onToggle={(d) => setNewDate([d])} disabledReason={disabledReason} single />
        <p className="text-xs text-slate-400">Submitting sets the request status to <b>Change Pending</b>.</p>
      </Dialog>
    </div>
  );
}
