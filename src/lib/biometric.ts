/**
 * Hardened WebAuthn-based biometric unlock.
 *
 * Compared with the previous version this module:
 *   - keeps a structured `BiometricState` record (credentialId,
 *     bindingId, accountId, enrolledAt, lastVerifiedAt)
 *   - exposes typed errors so callers can show specific messages
 *   - refuses to verify when the device binding doesn't match
 *   - only clears the biometric record on unrecoverable corruption
 *     (never the user session)
 *
 * The public exports kept for backward compatibility:
 *   isWebAuthnSupported, isBiometricAvailable, hasEnrolledBiometric,
 *   getEnrolledEmployeeEmail, enrollBiometric, verifyBiometric,
 *   clearEnrolledBiometric.
 */

import { log } from "./log";

const STORAGE_KEY = "primer_biometric_credential_v1";

export type BiometricErrorCode =
  | "unsupported"
  | "canceled"
  | "binding_mismatch"
  | "credential_corrupt"
  | "not_enrolled"
  | "unknown";

export class BiometricError extends Error {
  code: BiometricErrorCode;
  constructor(code: BiometricErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "BiometricError";
  }
}

interface BiometricState {
  credentialId: string; // base64url
  employeeId: string;
  email: string;
  bindingId?: string;
  enrolledAt?: number;
  lastVerifiedAt?: number;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function newChallenge(): ArrayBuffer {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr.buffer;
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

function readState(): BiometricState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricState;
    if (!parsed.credentialId || !parsed.employeeId) {
      log.warn("biometric", "stored credential missing required fields");
      return null;
    }
    return parsed;
  } catch (e) {
    log.warn("biometric", "stored credential unreadable", e);
    return null;
  }
}

function writeState(state: BiometricState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials &&
    typeof navigator.credentials.create === "function"
  );
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await (
      window.PublicKeyCredential as unknown as {
        isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean>;
      }
    ).isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    log.warn("biometric", "platform authenticator check failed", e);
    return false;
  }
}

export function hasEnrolledBiometric(): boolean {
  return readState() !== null;
}

export function getEnrolledEmployeeEmail(): string | null {
  return readState()?.email ?? null;
}

export function getEnrolledEmployeeId(): string | null {
  return readState()?.employeeId ?? null;
}

export function getEnrolledBindingId(): string | null {
  return readState()?.bindingId ?? null;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface EnrollOpts {
  employeeId: string;
  email: string;
  displayName: string;
  bindingId?: string;
}

export interface EnrollOk {
  ok: true;
}
export interface EnrollFail {
  ok: false;
  error: string;
  code: BiometricErrorCode;
}

export async function enrollBiometric(
  opts: EnrollOpts,
): Promise<EnrollOk | EnrollFail> {
  if (!isWebAuthnSupported()) {
    return {
      ok: false,
      code: "unsupported",
      error: "Biometric authentication is not supported on this device.",
    };
  }
  try {
    const userId = new TextEncoder().encode(opts.employeeId);
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: newChallenge(),
        rp: { name: "Primer Communications" },
        user: {
          id: userId,
          name: opts.email,
          displayName: opts.displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!cred) {
      return {
        ok: false,
        code: "canceled",
        error: "Biometric enrollment was cancelled.",
      };
    }

    const state: BiometricState = {
      credentialId: bufferToB64url(cred.rawId),
      employeeId: opts.employeeId,
      email: opts.email,
      bindingId: opts.bindingId,
      enrolledAt: Date.now(),
    };
    writeState(state);
    log.info("biometric", "enrollment succeeded");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Biometric enrollment failed.";
    if (/NotAllowedError|cancelled|aborted/i.test(msg)) {
      return {
        ok: false,
        code: "canceled",
        error: "Biometric prompt was cancelled.",
      };
    }
    log.warn("biometric", "enrollment failed", e);
    return { ok: false, code: "unknown", error: msg };
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifyOk {
  ok: true;
  employeeId: string;
  email: string;
}
export interface VerifyFail {
  ok: false;
  error: string;
  code: BiometricErrorCode;
}

export interface VerifyOpts {
  /** Current device binding id; when provided, verification refuses
   *  to proceed if the stored credential was enrolled on a different
   *  device. */
  currentBindingId?: string | null;
}

export async function verifyBiometric(
  opts: VerifyOpts = {},
): Promise<VerifyOk | VerifyFail> {
  if (!isWebAuthnSupported()) {
    return {
      ok: false,
      code: "unsupported",
      error: "Biometric authentication is not supported on this device.",
    };
  }

  const stored = readState();
  if (!stored) {
    // localStorage either empty OR holds an unreadable record; in the
    // latter case readState() already logged the warning. Clear the
    // corrupt blob so the UI can re-offer enrollment.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      code: "not_enrolled",
      error: "No biometric credential is enrolled on this device.",
    };
  }

  if (
    opts.currentBindingId &&
    stored.bindingId &&
    stored.bindingId !== opts.currentBindingId
  ) {
    return {
      ok: false,
      code: "binding_mismatch",
      error:
        "This device no longer matches the account that enabled biometric unlock. Please sign in with your password.",
    };
  }

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: newChallenge(),
        allowCredentials: [
          {
            id: b64urlToBuffer(stored.credentialId),
            type: "public-key",
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60_000,
        rpId: window.location.hostname,
      },
    });
    if (!assertion) {
      return {
        ok: false,
        code: "canceled",
        error: "Biometric verification was cancelled.",
      };
    }
    // Touch lastVerifiedAt for diagnostics.
    try {
      writeState({ ...stored, lastVerifiedAt: Date.now() });
    } catch {
      /* non-fatal */
    }
    return { ok: true, employeeId: stored.employeeId, email: stored.email };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Biometric verification failed.";
    if (/NotAllowedError|cancelled|aborted/i.test(msg)) {
      return {
        ok: false,
        code: "canceled",
        error: "Biometric prompt was cancelled.",
      };
    }
    log.warn("biometric", "verification failed", e);
    return { ok: false, code: "unknown", error: msg };
  }
}

export function clearEnrolledBiometric(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    log.info("biometric", "local enrollment cleared");
  } catch {
    /* ignore */
  }
}
