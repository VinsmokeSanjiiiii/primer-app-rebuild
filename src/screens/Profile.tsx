import { useRef, useState } from "react";
import { useApp } from "../store";
import { AppBar } from "../components/AppBar";
import { Card, Button, Badge, Avatar, Field, SectionTitle, Dialog, TextField, TextArea } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { tenureFrom } from "../lib/date";

export function Profile() {
  const { profile, updateProfile, signOut, navigate, toggleDark, dark, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [govOpen, setGovOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

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
        action={
          <button onClick={toggleDark} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
            <Icon name={dark ? "sun" : "moon"} size={20} />
          </button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
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

        {/* Shortcuts */}
        <SectionTitle>Shortcuts</SectionTitle>
        <div className="space-y-2">
          <NavRow icon="swap" label="Coverage board" onClick={() => navigate("coverage")} />
          <NavRow icon="calendar" label="Change leave/OT date" onClick={() => navigate("change-leave")} />
          <NavRow icon="inbox" label="Coverage records" onClick={() => navigate("coverage-records")} />
          <NavRow icon="alert" label="Infractions" onClick={() => navigate("infractions")} />
          <NavRow icon="lock" label="Change password" onClick={() => setPwOpen(true)} />
          <NavRow icon="logout" label="Log out" onClick={() => setLogoutOpen(true)} danger />
        </div>

        <p className="pb-2 text-center text-xs text-slate-400">Primer Communications · Employee Self-Service</p>
      </div>

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
    </div>
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

function NavRow({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-slate-800/60">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${danger ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"}`}>
        <Icon name={icon} size={18} />
      </div>
      <span className={`flex-1 text-sm font-semibold ${danger ? "text-rose-600 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
      <Icon name="chevron" size={18} className="text-slate-300" />
    </button>
  );
}
