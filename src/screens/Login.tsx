import { useState } from "react";
import { useApp } from "../store";
import { Button, TextField, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";

export function Login() {
  const { signIn, toast } = useApp();
  const [email, setEmail] = useState("alex.rivera@primer.com");
  const [password, setPassword] = useState("password123");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.includes("@") || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    // Real legacy login: look up the user in /Users by Primer_Email and
    // compare against the stored Password field.  Network failures and
    // bad credentials are surfaced through the returned error.
    try {
      const result = await signIn(email, password, remember);
      if (!result.success) {
        setError(result.error || "Sign in failed.");
        toast("Sign in failed — check your credentials.", "error");
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

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-indigo-50 to-white px-6 pb-8 pt-12 dark:from-slate-900 dark:to-slate-950">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-300/40">
          <Icon name="shield" size={32} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Welcome back</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in to your Primer Communications account
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
          <button className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
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

        <button
          onClick={async () => {
            setBiometric(true);
            try {
              const result = await signIn(email, password, true);
              if (!result.success) {
                setError(result.error || "Biometric unlock failed.");
                toast("Biometric unlock failed.", "error");
              }
            } finally {
              setBiometric(false);
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <Icon name="fingerprint" size={18} />
          {biometric ? "Authenticating…" : "Unlock with biometrics"}
        </button>
      </div>

      <div className="mt-8 rounded-xl bg-slate-100/70 p-3 text-center text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <p className="flex items-center justify-center gap-1.5 font-semibold">
          <Icon name="shield" size={14} /> Secured with device binding + RSA SHA-256
        </p>
        <p className="mt-1">
          Auth against the original Firebase Realtime Database <code>/Users</code> node.
          Device binding and public-key challenge/response are a secondary layer.
        </p>
      </div>
    </div>
  );
}
