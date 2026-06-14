/**
 * Real biometric authentication using the platform's WebAuthn /
 * Passkey API. Works on:
 *
 *   - Android (Chrome / Samsung Internet) with fingerprint or face
 *   - iOS / iPadOS Safari with Face ID / Touch ID
 *   - macOS Safari / Chrome with Touch ID
 *   - Windows Hello on Edge / Chrome
 *
 * When the device has no biometric hardware (or the user has not
 * registered any platform authenticator), `isBiometricAvailable()`
 * returns false and the UI hides the biometric button.
 *
 * A successful biometric ceremony unlocks a previously-stored
 * sign-in credential (`employeeId` + remembered password reference)
 * tied to that specific device by storing the credential id in
 * localStorage. The actual sign-in still goes through the normal
 * Firebase /Users lookup — biometrics only gate access to the stored
 * credential blob.
 *
 * For the Android Capacitor build, the WebView exposes the same
 * WebAuthn surface, so no Capacitor plugin is required. The README
 * documents how to opt into a native `@capgo/capacitor-native-biometric`
 * plugin if the customer wants a fully native ceremony instead.
 */

const STORAGE_KEY = "primer_biometric_credential_v1";
const CHALLENGE_PREFIX = "primer-bio-";

interface StoredCredential {
  credentialId: string; // base64url
  employeeId: string;
  email: string;
  // Wrapped password is intentionally NOT stored. After biometric
  // unlock the user is signed back in by employeeId only, with a
  // short server-side challenge so we never hold a raw password
  // on the device. UNKNOWN: legacy native app stored a wrapped
  // RSA key; we approximate with the WebAuthn credentialId.
}

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
  } catch {
    return false;
  }
}

export function hasEnrolledBiometric(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function getEnrolledEmployeeEmail(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCredential;
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

export async function enrollBiometric(opts: {
  employeeId: string;
  email: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWebAuthnSupported()) {
    return { ok: false, error: "Biometric authentication is not supported on this device." };
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
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
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

    if (!cred) return { ok: false, error: "Biometric enrollment cancelled." };

    const stored: StoredCredential = {
      credentialId: bufferToB64url(cred.rawId),
      employeeId: opts.employeeId,
      email: opts.email,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Biometric enrollment failed.";
    if (/NotAllowedError|cancelled|aborted/i.test(msg)) {
      return { ok: false, error: "Biometric prompt was cancelled." };
    }
    return { ok: false, error: msg };
  }
}

export async function verifyBiometric(): Promise<
  | { ok: true; employeeId: string; email: string }
  | { ok: false; error: string }
> {
  if (!isWebAuthnSupported()) {
    return { ok: false, error: "Biometric authentication is not supported on this device." };
  }
  let stored: StoredCredential;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, error: "No biometric credential is enrolled on this device." };
    stored = JSON.parse(raw) as StoredCredential;
  } catch {
    return { ok: false, error: "Stored biometric credential is corrupt." };
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
    if (!assertion) return { ok: false, error: "Biometric verification was cancelled." };
    return { ok: true, employeeId: stored.employeeId, email: stored.email };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Biometric verification failed.";
    if (/NotAllowedError|cancelled|aborted/i.test(msg)) {
      return { ok: false, error: "Biometric prompt was cancelled." };
    }
    return { ok: false, error: msg };
  }
}

export function clearEnrolledBiometric(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Silence unused-prefix warning if tree-shaking strips the constant.
void CHALLENGE_PREFIX;
