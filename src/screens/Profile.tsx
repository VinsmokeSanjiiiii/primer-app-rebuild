import { useRef, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, Avatar, Field, SectionTitle, Dialog, TextField, TextArea } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { PullToRefresh } from "../components/PullToRefresh";
import { tenureFrom } from "../lib/date";
import { APP_VERSION } from "../lib/appVersion";
import { bootController, useBootState } from "../lib/bootState";
import { downloadAndInstallApk } from "../lib/updateCheck";
import { Capacitor } from "@capacitor/core";

export function Profile() {
  const { profile, updateProfile, signOut, navigate, dark, toast, themeMode, setThemeMode, reduceMotion, setReduceMotion, refreshData } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [govOpen, setGovOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const bootState = useBootState();

  const [notesDraft, setNotesDraft] = useState(profile.notes);
  const [gov, setGov] = useState({
    philhealth: profile.philhealth, sss: profile.sss, tin: profile.tin, pagIbig: profile.pagIbig,
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile({ profileImageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex h-full flex-col">
      <AppBar
        title="Profile"
        showBack={false}
      />
      <PullToRefresh className="flex-1" scrollClassName="px-4 pb-6 pt-4" onRefresh={refreshData}>
        <div className="space-y-4">
        {/* Header */}
        <Card className="text-center">
          <div className="relative mx-auto w-fit">
            <Avatar url={profile.profileImageUrl} name={profile.fullName} size={88} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white ring-2 ring-white dark:ring-slate-800"
            >
              <Icon name="camera" size={15} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImage} />
          </div>
          <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">{profile.fullName}</h2>
          <p className="text-sm text-slate-400">{profile.position}</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Badge tone="green">{profile.status}</Badge>
            <Badge tone={profile.isClockedIn ? "sky" : "slate"}>
              {profile.isClockedIn ? "Clocked In" : "Clocked Out"}
            </Badge>
          </div>
        </Card>

        {/* Credits */}
        <div className="grid grid-cols-3 gap-2">
          <MiniCredit label="VL" value={profile.vlCredits} />
          <MiniCredit label="SL" value={profile.slCredits} />
          <MiniCredit label="BL" value={profile.blCredit} />
        </div>

        {/* Employment */}
        <SectionTitle>Employment</SectionTitle>
        <Card>
          <div className="grid grid-cols-2 gap-y-3">
            <Field label="Employee ID" value={profile.employeeId} />
            <Field label="Role" value={profile.role} />
            <Field label="Department" value={profile.department} />
            <Field label="Team" value={profile.team} />
            <Field label="Schedule" value={profile.schedule} />
            <Field label="Days off" value={profile.daysOff} />
            <Field label="Date started" value={profile.dateStarted} />
            <Field label="Tenure" value={tenureFrom(profile.dateStarted)} />
            <Field label="Work setup" value={profile.workSetup} />
            <Field label="Phone" value={profile.phoneName} />
          </div>
        </Card>

        {/* Contact */}
        <SectionTitle>Contact</SectionTitle>
        <Card>
          <div className="space-y-3">
            <Field label="Primer email" value={profile.primerEmail} />
            <Field label="Personal email" value={profile.personalEmail} />
            <Field label="Contact number" value={profile.contactNumber} />
            <Field label="Address" value={profile.address} />
            <Field label="Birth date" value={profile.birthDate} />
          </div>
        </Card>

        {/* Notes */}
        <SectionTitle action={<button onClick={() => { setNotesDraft(profile.notes); setNotesOpen(true); }} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Edit</button>}>
          Notes
        </SectionTitle>
        <Card><p className="text-sm text-slate-600 dark:text-slate-300">{profile.notes || "No notes."}</p></Card>

        {/* Gov ID */}
        <SectionTitle action={<button onClick={() => setGovOpen(true)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Edit</button>}>
          Government IDs
        </SectionTitle>
        <Card>
          <div className="grid grid-cols-2 gap-y-3">
            <Field label="PhilHealth" value={profile.philhealth} />
            <Field label="SSS" value={profile.sss} />
            <Field label="TIN" value={profile.tin} />
            <Field label="Pag-IBIG" value={profile.pagIbig} />
          </div>
        </Card>

        {/* Appearance — theme only; nav blur is always on */}
        <SectionTitle>Appearance</SectionTitle>
        <Card>
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Theme</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            {(["system", "light", "dark"] as const).map((m) => {
              const active = themeMode === m;
              const iconName: IconName = m === "system" ? "refresh" : m === "light" ? "sun" : "moon";
              return (
                <button
                  key={m}
                  onClick={() => setThemeMode(m)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold capitalize transition ${
                    active
                      ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  <Icon name={iconName} size={14} />
                  {m}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {themeMode === "system" ? `Following device · currently ${dark ? "dark" : "light"}` : "Manual override"}
          </p>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reduce motion</p>
              <p className="text-[11px] text-slate-400">Minimizes animations across the app.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reduceMotion}
              onClick={() => setReduceMotion(!reduceMotion)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                reduceMotion ? "bg-indigo-600" : "bg-slate-300 dark:bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  reduceMotion ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </Card>

        {/* Shortcuts */}
        <SectionTitle>Shortcuts</SectionTitle>
        <div className="space-y-2">
          <NavRow icon="calendar" label="Change leave/OT date" onClick={() => navigate("change-leave")} />
          <NavRow icon="swap" label="Coverage records" onClick={() => navigate("coverage-records")} disabled={!profile.isFlextime} disabledReason="Flextime employees only" />
          <NavRow icon="alert" label="Infractions" onClick={() => navigate("infractions")} />
          <NavRow icon="lock" label="Change password" onClick={() => setPwOpen(true)} />
          <NavRow icon="logout" label="Log out" onClick={() => setLogoutOpen(true)} danger />
        </div>

        {/* App version */}
          <SectionTitle>About</SectionTitle>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Primer ESS</p>
                <p className="text-xs text-slate-400 mt-0.5">Employee Self-Service</p>
              </div>
              <VersionBadge onUpdate={() => setUpdateOpen(true)} bootState={bootState} />
            </div>
          </Card>
                  <p className="pb-2 text-center text-xs text-slate-400">Primer Communications · Employee Self-Service</p>
        </div>
      </PullToRefresh>

      {/* Notes dialog */}
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)} title="Edit notes"
        footer={<>
          <Button variant="secondary" full onClick={() => setNotesOpen(false)}>Cancel</Button>
          <Button full onClick={() => { updateProfile({ notes: notesDraft }); setNotesOpen(false); }}>Save</Button>
        </>}>
        <TextArea rows={4} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
      </Dialog>

      {/* Gov ID dialog */}
      <Dialog open={govOpen} onClose={() => setGovOpen(false)} title="Government IDs"
        footer={<>
          <Button variant="secondary" full onClick={() => setGovOpen(false)}>Cancel</Button>
          <Button full onClick={() => { updateProfile(gov); setGovOpen(false); }}>Save</Button>
        </>}>
        <TextField label="PhilHealth" value={gov.philhealth} onChange={(e) => setGov({ ...gov, philhealth: e.target.value })} />
        <TextField label="SSS" value={gov.sss} onChange={(e) => setGov({ ...gov, sss: e.target.value })} />
        <TextField label="TIN" value={gov.tin} onChange={(e) => setGov({ ...gov, tin: e.target.value })} />
        <TextField label="Pag-IBIG" value={gov.pagIbig} onChange={(e) => setGov({ ...gov, pagIbig: e.target.value })} />
      </Dialog>

      {/* Password dialog */}
      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title="Change password"
        footer={<>
          <Button variant="secondary" full onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button full onClick={() => {
            if (pw.next.length < 6) return toast("Password too short.", "error");
            if (pw.next !== pw.confirm) return toast("Passwords do not match.", "error");
            setPw({ current: "", next: "", confirm: "" });
            setPwOpen(false);
            toast("Password updated on the Users record.", "success");
          }}>Update</Button>
        </>}>
        <TextField label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <TextField label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <TextField label="Confirm new password" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
      </Dialog>

      {/* Logout */}
      <Dialog open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out?"
        footer={<>
          <Button variant="secondary" full onClick={() => setLogoutOpen(false)}>Stay</Button>
          <Button variant="danger" full onClick={signOut}>Log out</Button>
        </>}>
        <p>You'll need to sign in again. Device binding remains registered.</p>
      </Dialog>

      {/* Update modal */}
      <UpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} bootState={bootState} />
    </div>
  );
}


// ─── Update UI ────────────────────────────────────────────────────────────────

type BootState = ReturnType<typeof bootController.getState>;

function VersionBadge({ onUpdate, bootState }: { onUpdate: () => void; bootState: BootState }) {
  const remoteVersion = bootState.info?.currentVersion;
  const hasUpdate = bootState.status === "updateAvailable" || bootState.status === "mandatoryUpdate";
  return (
    <div className="text-right">
      <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">v{APP_VERSION}</p>
      {hasUpdate ? (
        <button
          onClick={onUpdate}
          className="mt-0.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        >
          v{remoteVersion} available ↓
        </button>
      ) : bootState.status === "checking" ? (
        <p className="text-[11px] text-slate-400">Checking…</p>
      ) : (
        <p className="text-[11px] text-emerald-500 font-semibold">Up to date</p>
      )}
    </div>
  );
}

const PENDING_APK_KEY = "primer.pendingApkPath";

function UpdateModal({
  open,
  onClose,
  bootState,
}: {
  open: boolean;
  onClose: () => void;
  bootState: BootState;
}) {
  const [phase, setPhase] = useState<"idle" | "downloading" | "installing" | "done" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const startDownload = async () => {
    const url = bootState.info?.androidDownloadUrl ?? "";
    if (!url && Capacitor.isNativePlatform()) {
      setErrMsg("No download URL set for this update. Contact your administrator.");
      setPhase("error");
      return;
    }
    try {
      setPhase("downloading");
      setProgress(0);
      setErrMsg("");
      await downloadAndInstallApk(url, { onProgress: (pct: number | null) => setProgress(pct ?? 0) });
      localStorage.setItem(PENDING_APK_KEY, url);
      localStorage.removeItem(PENDING_APK_KEY);
      setPhase("done");
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      setErrMsg(err.message ?? "Update failed. Please try again.");
      setPhase(err.kind === "open" || err.kind === "permission" ? "installing" : "error");
    }
  };

  const retryInstall = async () => {
    const pending = localStorage.getItem(PENDING_APK_KEY) ?? "";
    if (!pending) { setPhase("error"); setErrMsg("No pending update found."); return; }
    try {
      await downloadAndInstallApk(pending);
      localStorage.removeItem(PENDING_APK_KEY);
      setPhase("done");
    } catch (e) {
      setErrMsg((e as Error).message ?? "Install failed.");
      setPhase("error");
    }
  };

  const handleClose = () => {
    if (phase === "downloading") return;
    setPhase("idle"); setProgress(null); setErrMsg("");
    onClose();
  };

  const remoteVersion = bootState.info?.currentVersion ?? "?";
  const isMandatory = bootState.status === "mandatoryUpdate";
  const hasUrl = !!bootState.info?.androidDownloadUrl;

  let footer: React.ReactNode;
  if (phase === "idle") {
    footer = (
      <>
        {!isMandatory && <Button variant="secondary" full onClick={handleClose}>Later</Button>}
        <Button full onClick={startDownload}>
          {Capacitor.isNativePlatform() && hasUrl ? "Download & Install" : "View Update"}
        </Button>
      </>
    );
  } else if (phase === "downloading") {
    footer = <Button full disabled>Downloading…</Button>;
  } else if (phase === "installing") {
    footer = (
      <>
        <Button variant="secondary" full onClick={handleClose}>Dismiss</Button>
        <Button full onClick={retryInstall}>Install Now</Button>
      </>
    );
  } else if (phase === "done") {
    footer = <Button full onClick={handleClose}>Close</Button>;
  } else {
    footer = (
      <>
        <Button variant="secondary" full onClick={handleClose}>Cancel</Button>
        <Button full onClick={() => { setPhase("idle"); setErrMsg(""); }}>Retry</Button>
      </>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Update available" footer={footer}>
      {phase === "idle" && (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-indigo-50 p-3 dark:bg-indigo-500/10">
            <Icon name="refresh" size={20} className="text-indigo-600 dark:text-indigo-300" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">v{remoteVersion} available</p>
              <p className="text-xs text-slate-400">You are on v{APP_VERSION}</p>
            </div>
          </div>
          {isMandatory && (
            <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              This update is required to continue using the app.
            </p>
          )}
        </>
      )}
      {phase === "downloading" && (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Downloading v{remoteVersion}…
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: progress != null ? `${progress}%` : "0%" }}
            />
          </div>
          {progress != null && (
            <p className="mt-1.5 text-right text-xs text-slate-400">{progress}%</p>
          )}
        </>
      )}
      {phase === "installing" && (
        <div className="flex items-start gap-2">
          <Icon name="check" size={18} className="mt-0.5 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">APK downloaded</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {errMsg || "Tap Install Now. If prompted by Android, allow installation from this source."}
            </p>
          </div>
        </div>
      )}
      {phase === "done" && (
        <div className="flex items-start gap-2">
          <Icon name="check" size={18} className="mt-0.5 text-emerald-500" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Installer launched. Follow the on-screen steps to complete.
          </p>
        </div>
      )}
      {phase === "error" && (
        <div className="flex items-start gap-2">
          <Icon name="alert" size={18} className="mt-0.5 text-rose-500" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{errMsg || "Something went wrong."}</p>
        </div>
      )}
    </Dialog>
  );
}

function MiniCredit({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 text-center dark:border-white/10 dark:bg-slate-800/60">
      <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{value}</p>
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}

function NavRow({
  icon, label, onClick, danger, disabled, disabledReason,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.99] ${
        disabled
          ? "cursor-not-allowed border-slate-200/50 bg-slate-50 opacity-50 dark:border-white/5 dark:bg-slate-800/30"
          : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800/60"
      }`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
        disabled
          ? "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
          : danger
          ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
          : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
      }`}>
        <Icon name={icon} size={18} />
      </div>
      <span className={`flex-1 text-sm font-semibold ${
        disabled
          ? "text-slate-400 dark:text-slate-500"
          : danger
          ? "text-rose-600 dark:text-rose-300"
          : "text-slate-700 dark:text-slate-200"
      }`}>
        {label}
        {disabled && disabledReason && (
          <span className="ml-2 text-[11px] font-normal text-slate-400">({disabledReason})</span>
        )}
      </span>
      {!disabled && <Icon name="chevron" size={18} className="text-slate-300" />}
    </button>
  );
}
