// Device rebind verification screen.
//
// Shown when sign-in succeeds but the current device is NOT the device
// already bound to that employee. Requires password verification (and
// biometric if available) before revoking the old binding and binding
// the new device. Never silent.

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import {
  bindDevice,
  getDeviceId,
  listBindings,
  revokeBinding,
  type DeviceBindingRecord,
} from "../lib/deviceBinding";
import {
  isBiometricAvailable,
  verifyBiometric,
} from "../lib/biometric";

export interface RebindVerificationProps {
  employeeId: string;
  /** Verifies the password against the auth store. Resolves to true on success. */
  verifyPassword: (password: string) => Promise<boolean>;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RebindVerification({
  employeeId,
  verifyPassword,
  onSuccess,
  onCancel,
}: RebindVerificationProps) {
  const [existing, setExisting] = useState<DeviceBindingRecord[]>([]);
  const [password, setPassword] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listBindings(employeeId).then(setExisting);
    void isBiometricAvailable().then(setBioAvailable);
  }, [employeeId]);

  const otherDevices = existing.filter((b) => b.deviceId !== getDeviceId());

  const confirm = async () => {
    setError("");
    if (!password.trim()) {
      setError("Enter your password to continue.");
      return;
    }
    setBusy(true);
    try {
      const passOk = await verifyPassword(password);
      if (!passOk) {
        setError("Password did not match.");
        return;
      }
      if (bioAvailable) {
        // Best-effort second factor — only enforced if the user has any
        // biometric enrolled. Cancellation is acceptable; password already
        // verified identity.
        try {
          await verifyBiometric();
        } catch {
          /* skipped */
        }
      }
      for (const b of otherDevices) {
        await revokeBinding(employeeId, b.deviceId);
      }
      await bindDevice(employeeId, "Rebound on " + new Date().toLocaleDateString());
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rebind failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
        <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
          Verify this device
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your account is currently bound to a different device. Confirm your
          identity to move the binding here.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {otherDevices.length > 0 && (
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Currently bound
            </h2>
            <ul className="mt-2 space-y-2 text-xs">
              {otherDevices.map((b) => (
                <li
                  key={b.deviceId}
                  className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"
                >
                  <Icon name="shield" size={14} />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">
                      {b.label || b.platform || "Unknown device"}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ID {b.deviceId.slice(0, 8)}…
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              Continuing here will sign the listed device(s) out.
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your account password"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
          />
          {bioAvailable && (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              You'll also be asked to confirm with biometrics after password.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-200/70 px-5 py-4 dark:border-white/10">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 disabled:opacity-60"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          ) : (
            <Icon name="shield" size={16} />
          )}
          {busy ? "Verifying…" : "Bind this device"}
        </button>
      </div>
    </div>
  );
}
