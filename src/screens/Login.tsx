import { useEffect, useState } from "react";
import { useApp } from "../store";
import { Button, TextField, Spinner, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import {
  enrollBiometric,
  getEnrolledEmployeeEmail,
  hasEnrolledBiometric,
  isBiometricAvailable,
  verifyBiometric,
} from "../lib/biometric";
import { requestPasswordReset } from "../lib/forgot-password";

export function Login() {
  const { signIn, signInWithEmployeeId, toast } = useApp();
  // No more dummy pre-fill — the previous "alex.rivera@primer.com" seed
  // was the source of the dummy-data bug.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState(false);

  // Biometric capability detection
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioEmail, setBioEmail] = useState<string | null>(null);

  // Forgot-password dialog
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Enrollment prompt after first successful sign-in on a device
  // that supports biometrics.
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<{
    employeeId: string;
    email: string;
    displayName: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBioSupported(available);
      const enrolled = hasEnrolledBiometric();
      setBioEnrolled(enrolled);
      setBioEmail(getEnrolledEmployeeEmail());
      if (enrolled && available) {
        const e = getEnrolledEmployeeEmail();
        if (e) setEmail(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setError("");
    if (!email.includes("@") || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn(email, password, remember);
      if (!result.success) {
        setError(result.error || "Sign in failed.");
        toast("Sign in failed — check your credentials.", "error");
      } else if (
        bioSupported &&
        !bioEnrolled &&
        result.employeeId
      ) {
        // Offer biometric enrollment after a successful login.
        setPendingProfile({
          employeeId: result.employeeId,
          email,
          displayName: result.fullName ?? email,
        });
        setEnrollOpen(true);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? `Network error: ${e.message}`
          : "Network error during sign in. Please retry.",
      );
      toast("Network error during sign in.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setError("");
    setBiometric(true);
    try {
      const verified = await verifyBiometric();
      if (!verified.ok) {
        setError(verified.error);
        toast(verified.error, "error");
        return;
      }
      const result = await signInWithEmployeeId(verified.employeeId, true);
      if (!result.success) {
        setError(result.error || "Biometric unlock failed.");
        toast(result.error || "Biometric unlock failed.", "error");
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? `Network error: ${e.message}`
          : "Network error during biometric unlock.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBiometric(false);
    }
  };

  const handleEnroll = async () => {
    if (!pendingProfile) return;
    const result = await enrollBiometric(pendingProfile);
    if (result.ok) {
      setBioEnrolled(true);
      setBioEmail(pendingProfile.email);
      toast("Biometric unlock enabled on this device.", "success");
    } else {
      toast(result.error, "error");
    }
    setEnrollOpen(false);
    setPendingProfile(null);
  };

  const handleForgot = async () => {
    setForgotError("");
    setForgotSending(true);
    try {
      const result = await requestPasswordReset(forgotEmail || email);
      if (result.ok) {
        setForgotSent(true);
      } else {
        setForgotError(result.error ?? "Could not send reset email.");
      }
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-indigo-50 to-white px-6 pb-8 pt-12 dark:from-slate-900 dark:to-slate-950">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-300/40">
          <Icon name="shield" size={32} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Welcome back</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in to Primer Communications
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@primer.com"
          autoComplete="username"
        />
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Password
          </span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label={show ? "Hide password" : "Show password"}
            >
              <Icon name={show ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => {
              setForgotEmail(email);
              setForgotSent(false);
              setForgotError("");
              setForgotOpen(true);
            }}
            className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button full onClick={submit} disabled={loading}>
          {loading ? <Spinner size={18} /> : <Icon name="lock" size={18} />}
          {loading ? "Verifying…" : "Sign in"}
        </Button>

        {bioSupported && bioEnrolled && (
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={biometric}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Icon name="fingerprint" size={18} />
            {biometric
              ? "Authenticating…"
              : bioEmail
                ? `Unlock as ${bioEmail}`
                : "Unlock with biometrics"}
          </button>
        )}
        {bioSupported && !bioEnrolled && (
          <p className="text-center text-xs text-slate-400">
            Sign in once to enable biometric unlock on this device.
          </p>
        )}
        {!bioSupported && (
          <p className="text-center text-xs text-slate-400">
            Biometric unlock is unavailable on this device.
          </p>
        )}
      </div>

      <div className="mt-8 rounded-xl bg-slate-100/70 p-3 text-center text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <p className="flex items-center justify-center gap-1.5 font-semibold">
          <Icon name="shield" size={14} /> Secured by Firebase + platform biometrics
        </p>
        <p className="mt-1">
          Accounts are stored in the Primer Realtime Database. Biometric unlock
          uses your device&rsquo;s platform authenticator (Face ID, fingerprint,
          Windows Hello, etc.).
        </p>
      </div>

      {/* Forgot password dialog */}
      <Dialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset your password"
        footer={
          forgotSent ? (
            <Button full onClick={() => setForgotOpen(false)}>
              Done
            </Button>
          ) : (
            <Button full onClick={handleForgot} disabled={forgotSending}>
              {forgotSending ? <Spinner size={18} /> : <Icon name="lock" size={18} />}
              {forgotSending ? "Sending…" : "Send reset link"}
            </Button>
          )
        }
      >
        {forgotSent ? (
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              A secure password reset link has been emailed to{" "}
              <span className="font-semibold">{forgotEmail || email}</span>.
            </p>
            <p>
              Open the email on this device, follow the link, choose a new
              password, then sign in.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Enter the email on file for your Primer account. We&rsquo;ll send
              a secure reset link that expires after a short time.
            </p>
            <TextField
              label="Primer email"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@primer.com"
            />
            {forgotError && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Biometric enrollment prompt */}
      <Dialog
        open={enrollOpen}
        onClose={() => {
          setEnrollOpen(false);
          setPendingProfile(null);
        }}
        title="Enable biometric unlock?"
        footer={
          <div className="flex w-full gap-2">
            <button
              onClick={() => {
                setEnrollOpen(false);
                setPendingProfile(null);
              }}
              className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200"
            >
              Not now
            </button>
            <Button full onClick={handleEnroll}>
              <Icon name="fingerprint" size={18} />
              Enable
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Use your device&rsquo;s fingerprint, face, or PIN to sign in faster
          next time. You can disable this later in your profile.
        </p>
      </Dialog>
    </div>
  );
}
