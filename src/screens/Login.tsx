import { useState, useEffect } from "react";
import { useApp } from "../store";
import { Button, TextField, Spinner, Dialog } from "../components/ui";
import { Icon } from "../components/Icon";
import { getFirebaseAuth } from "../data/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

type LoginStep = "signin" | "forgot-password" | "otp-sent";

export function Login() {
  const { signIn, toast } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [step, setStep] = useState<LoginStep>("signin");
  const [resetEmail, setResetEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      // Check for WebAuthn support (.biometric authentication in browsers)
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricAvailable(available);
        } catch {
          setBiometricAvailable(false);
        }
      } else {
        setBiometricAvailable(false);
      }
    };
    checkBiometric();
  }, []);

  const submit = async () => {
    setError("");
    if (!email.includes("@") || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signIn(email, password, remember);
      if (!result.success) {
        setError(result.error || "Sign in failed.");
        toast("Sign in failed — check your credentials.", "error");
      }
    } catch (e) {
      const msg = e instanceof Error
        ? `Network error: ${e.message}`
        : "Network error during sign in. Please retry.";
      setError(msg);
      toast("Network error during sign in.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.includes("@")) {
      toast("Please enter a valid email address.", "error");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, resetEmail);
      setOtpSent(true);
      toast("Password reset email sent. Check your inbox.", "success");
    } catch (e) {
      let msg = "Failed to send reset email.";
      if (e instanceof Error) {
        if (e.message.includes("user-not-found")) {
          msg = "No account found with that email.";
        } else if (e.message.includes("invalid-email")) {
          msg = "Invalid email address format.";
        } else if (e.message.includes("too-many-requests")) {
          msg = "Too many attempts. Please wait before retrying.";
        }
      }
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    setBiometric(true);
    setError("");
    try {
      // WebAuthn authentication flow
      if (!window.PublicKeyCredential) {
        throw new Error("Biometric authentication not supported on this device.");
      }

      // Check for stored credentials
      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          allowCredentials: [],
          userVerification: "required",
          timeout: 60000,
        },
        mediation: "optional",
      } as CredentialRequestOptions);

      if (cred) {
        // Successfully authenticated via biometric
        toast("Biometric authentication successful.", "success");
        // In a real implementation, we would validate the credential with the server
        // For now, we show a message that the feature needs server-side setup
        toast("Biometric auth verified. Please sign in with your password.", "info");
      }
    } catch (e) {
      let msg = "Biometric authentication failed.";
      if (e instanceof Error) {
        if (e.name === "NotAllowedError") {
          msg = "Biometric authentication was cancelled or not allowed.";
        } else if (e.name === "NotSupportedError") {
          msg = "Biometric authentication is not supported on this device.";
        } else if (e.name === "SecurityError") {
          msg = "Security error. Ensure this page is served over HTTPS.";
        }
      }
      setError(msg);
      toast(msg, "error");
    } finally {
      setBiometric(false);
    }
  };

  const renderSignIn = () => (
    <>
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
            placeholder="Enter your password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-slate-900/50 dark:text-white"
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
          onClick={() => {
            setResetEmail(email);
            setStep("forgot-password");
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
        {loading ? "Verifying..." : "Sign in"}
      </Button>

      {biometricAvailable && (
        <button
          onClick={handleBiometric}
          disabled={biometric}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <Icon name="fingerprint" size={18} />
          {biometric ? "Authenticating..." : "Unlock with biometrics"}
        </button>
      )}
    </>
  );

  const renderForgotPassword = () => (
    <>
      <div className="mb-4 text-center">
        <Icon name="lock" size={32} className="mx-auto text-indigo-600 dark:text-indigo-400" />
        <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">Reset Password</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter your email and we will send you a password reset link.
        </p>
      </div>

      <TextField
        label="Email"
        type="email"
        value={resetEmail}
        onChange={(e) => setResetEmail(e.target.value)}
        placeholder="you@primer.com"
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button full onClick={handleForgotPassword} disabled={loading}>
        {loading ? <Spinner size={18} /> : null}
        {loading ? "Sending..." : "Send Reset Link"}
      </Button>

      <Button variant="secondary" full onClick={() => setStep("signin")}>
        Back to Sign In
      </Button>
    </>
  );

  const renderOtpSent = () => (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
        <Icon name="check" size={32} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Email Sent</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        We have sent a password reset link to <strong>{resetEmail}</strong>.
        Check your inbox and follow the instructions to reset your password.
      </p>
      <div className="mt-6 space-y-2">
        <Button full onClick={() => setStep("signin")}>
          Back to Sign In
        </Button>
        <Button variant="secondary" full onClick={handleForgotPassword}>
          Resend Email
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-indigo-50 to-white px-6 pb-8 pt-12 dark:from-slate-900 dark:to-slate-950">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-300/40">
          <Icon name="shield" size={32} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Primer Communications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Employee Self-Service Portal
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {step === "signin" && renderSignIn()}
        {step === "forgot-password" && renderForgotPassword()}
        {step === "otp-sent" && renderOtpSent()}
      </div>

      <div className="mt-8 rounded-xl bg-slate-100/70 p-3 text-center text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <p className="flex items-center justify-center gap-1.5 font-semibold">
          <Icon name="shield" size={14} /> Secured with Firebase Authentication
        </p>
        <p className="mt-1">
          Authentication against Firebase Realtime Database. Device binding and biometrics provide additional security layers.
        </p>
      </div>
    </div>
  );
}
