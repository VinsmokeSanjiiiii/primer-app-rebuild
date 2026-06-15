import { useState } from "react";
import { useApp } from "../store";
import { Card, Avatar, Badge, Button, Dialog, Field, SectionTitle } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { tenureFrom } from "../lib/date";

export function Dashboard() {
  const { profile, leaves, ot, infractions, navigate, notifications } = useApp();
  const [reqOpen, setReqOpen] = useState(false);
  const unread = notifications.filter((n) => !n.readAt).length;
  const userInfractions = infractions.filter((i) => i.employeeId === profile.employeeId);
  const infractionCount = userInfractions.length;

  const pending = [
    ...leaves
      .filter((l) => l.status === "Pending" || l.status === "Approved" || l.status === "Change Pending")
      .map((l) => ({
        id: l.id,
        title: `${l.leaveType}`,
        date: l.leaveDate.join(", "),
        status: l.status,
        ts: l.createdAt,
      })),
    ...ot
      .filter((o) => o.status === "Pending" || o.status === "Approved" || o.status === "Change Pending")
      .map((o) => ({
        id: o.id,
        title: `${o.otType}`,
        date: o.otDate,
        status: o.status,
        ts: o.createdAt,
      })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      {/* Greeting header - email removed as it appears elsewhere in profile */}
      <div className="flex items-center gap-3">
        <Avatar url={profile.profileImageUrl} name={profile.fullName} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">Welcome back,</p>
          <h1 className="truncate text-lg font-black text-slate-900 dark:text-white">
            {profile.fullName}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {profile.position}
          </p>
        </div>
        <button
          onClick={() => navigate("notifications")}
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Icon name="bell" size={20} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      </div>

      {/* Clock status card */}
      <Card
        className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
        onClick={() => navigate("clock")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/70">Clock status</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  profile.isClockedIn ? "bg-emerald-300" : "bg-rose-300"
                } animate-pulse`}
              />
              <p className="text-xl font-black">
                {profile.isClockedIn ? "Clocked In" : "Clocked Out"}
              </p>
            </div>
            <p className="mt-1 text-xs text-white/70">Schedule {profile.schedule}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Icon name="clock" size={26} />
            </div>
            <span className="text-[11px] font-semibold text-white/80">Tap to clock</span>
          </div>
        </div>
      </Card>

      {/* Credits row */}
      <div className="grid grid-cols-3 gap-2">
        <CreditChip label="Vacation" value={profile.vlCredits} tone="indigo" />
        <CreditChip label="Sick" value={profile.slCredits} tone="sky" />
        <CreditChip label="Birthday" value={profile.blCredit} tone="amber" />
      </div>

      {/* Quick actions */}
      <SectionTitle>Quick actions</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon="plus" label="Request" onClick={() => setReqOpen(true)} />
        <QuickAction icon="clock" label="Clock" onClick={() => navigate("clock")} />
        <QuickAction icon="swap" label="Coverage" onClick={() => navigate("coverage")} />
        <QuickAction icon="alert" label="Infractions" onClick={() => navigate("infractions")} badge={infractionCount} />
      </div>

      {/* Profile summary */}
      <SectionTitle action={<button onClick={() => navigate("profile")} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">View all</button>}>
        Profile summary
      </SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-y-3">
          <Field label="Role" value={profile.role} />
          <Field label="Team" value={profile.team} />
          <Field label="Position" value={profile.position} />
          <Field label="Days off" value={profile.daysOff} />
          <Field label="Date started" value={profile.dateStarted} />
          <Field label="Tenure" value={tenureFrom(profile.dateStarted)} />
          <Field label="Work setup" value={profile.workSetup} />
          <Field
            label="Status"
            value={<Badge tone="green">{profile.status}</Badge>}
          />
        </div>
      </Card>

      {/* Merged request timeline */}
      <SectionTitle action={<button onClick={() => navigate("requests")} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">All requests</button>}>
        Pending & active requests
      </SectionTitle>
      {pending.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm text-slate-400">No active requests.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {pending.slice(0, 4).map((p) => (
            <Card key={p.id} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Icon name={p.title.includes("Time") ? "bolt" : "umbrella"} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {p.title}
                </p>
                <p className="truncate text-xs text-slate-400">{p.date}</p>
              </div>
              <StatusBadge status={p.status} />
            </Card>
          ))}
        </div>
      )}

      {/* Request type chooser with maintenance mode for OT and Tech Issue */}
      <Dialog
        open={reqOpen}
        onClose={() => setReqOpen(false)}
        title="New request"
      >
        <div className="space-y-2">
          <RequestOption
            icon="umbrella"
            title="Leave request"
            desc="Vacation, Sick, Bereavement, or Birthday leave"
            onClick={() => { setReqOpen(false); navigate("leave"); }}
          />
          <RequestOption
            icon="bolt"
            title="OT request"
            desc="Overtime or rest-day overtime"
            disabled
            disabledReason="Under maintenance"
            onClick={() => {}}
          />
          <RequestOption
            icon="wrench"
            title="Tech issue coverage"
            desc="Report hours lost to technical issues"
            disabled
            disabledReason="Under maintenance"
            onClick={() => {}}
          />
        </div>
      </Dialog>
    </div>
  );
}

function CreditChip({ label, value, tone }: { label: string; value: number; tone: "indigo" | "sky" | "amber" }) {
  const tones = {
    indigo: "from-indigo-50 to-white text-indigo-700 dark:from-indigo-500/15 dark:to-transparent dark:text-indigo-300",
    sky: "from-sky-50 to-white text-sky-700 dark:from-sky-500/15 dark:to-transparent dark:text-sky-300",
    amber: "from-amber-50 to-white text-amber-700 dark:from-amber-500/15 dark:to-transparent dark:text-amber-300",
  };
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-gradient-to-b p-3 text-center dark:border-white/10 ${tones[tone]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

function QuickAction({ icon, label, onClick, badge }: { icon: IconName; label: string; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200/70 bg-white p-3 text-slate-700 transition active:scale-95 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Icon name={icon} size={18} />
      </div>
      <span className="text-[11px] font-semibold">{label}</span>
      {badge ? (
        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function RequestOption({ icon, title, desc, onClick, disabled, disabledReason }: { icon: IconName; title: string; desc: string; onClick: () => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-white/5 dark:bg-slate-800/30"
          : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
        disabled
          ? "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
          : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
      }`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${disabled ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>{title}</p>
        <p className="text-xs text-slate-400">{desc}</p>
        {disabled && disabledReason && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{disabledReason}</p>
        )}
      </div>
      {!disabled && <Icon name="chevron" size={18} className="text-slate-300" />}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "green" | "amber" | "rose" | "indigo" | "slate" | "sky"> = {
    Approved: "green",
    Completed: "green",
    Pending: "amber",
    "For Approval": "amber",
    "Change Pending": "indigo",
    Ongoing: "sky",
    Available: "sky",
    Declined: "rose",
    Disapproved: "rose",
    Cancelled: "slate",
  };
  return <Badge tone={map[status] ?? "slate"}>{status}</Badge>;
}
