/**
 * Real forgot-password flow.
 *
 * The original Android app shipped a custom OTP-by-email flow that
 * relied on a server endpoint owned by the company. The web rebuild
 * does not host a server runtime, so we use Firebase Authentication's
 * built-in password reset, which sends a secure, time-limited
 * verification link to the user's email. This is the same primitive
 * Google and Microsoft use for their own account-recovery flows and
 * is functionally equivalent to (and more secure than) a 6-digit OTP.
 *
 * Flow:
 *   1. User enters their Primer email.
 *   2. We look up the matching `/Users` record to ensure the account
 *      exists in the Realtime Database.
 *   3. We call Firebase Auth `sendPasswordResetEmail()`.
 *   4. Firebase emails a secure verification link. Clicking the link
 *      lands the user on Firebase's hosted reset page where they
 *      choose a new password.
 *   5. After resetting, the user signs in with the new password and
 *      we mirror it back into `/Users/{id}/Password` for the legacy
 *      RTDB-backed auth used by other surfaces (when applicable).
 *
 * NOTE (UNKNOWN): The legacy app stored passwords as plain strings
 * under `/Users/{id}/Password`. Firebase Auth uses its own salted
 * hashes. After a successful reset the user should also update the
 * `/Users/{id}/Password` mirror through the in-app "Change password"
 * flow so attendance, OT, and coverage continue to authenticate.
 * This is documented in the README.
 */
import { sendPasswordResetEmail } from "firebase/auth";
import { get, query, ref, orderByChild, equalTo } from "firebase/database";
import { getDb, getFbAuth } from "../data/firebase";

export interface ResetResult {
  ok: boolean;
  error?: string;
}

export async function requestPasswordReset(
  rawEmail: string,
): Promise<ResetResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    // Verify the account exists in the legacy /Users node so we
    // never trigger a reset email for a stranger's address. The
    // RTDB lookup matches `Primer_Email` exactly.
    const db = getDb();
    const q = query(
      ref(db, "Users"),
      orderByChild("Primer_Email"),
      equalTo(rawEmail.trim()),
    );
    const snap = await get(q);
    if (!snap.exists()) {
      // Try a case-insensitive scan as a safety net (legacy data
      // sometimes has mixed casing).
      const allSnap = await get(ref(db, "Users"));
      const all =
        (allSnap.val() as Record<string, { Primer_Email?: string }>) ?? {};
      const found = Object.values(all).some(
        (rec) =>
          typeof rec?.Primer_Email === "string" &&
          rec.Primer_Email.trim().toLowerCase() === email,
      );
      if (!found) {
        return {
          ok: false,
          error: "No Primer account is registered with that email.",
        };
      }
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Network error checking your account: ${e.message}`
          : "Network error checking your account.",
    };
  }

  try {
    await sendPasswordResetEmail(getFbAuth(), email);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send reset email.";
    // Firebase Auth surfaces auth/user-not-found when the email has
    // never been registered against Firebase Auth (only the legacy
    // /Users record exists). In that case we explain the limitation
    // to the user so they can contact HR.
    if (/user-not-found|auth\/user-not-found/i.test(msg)) {
      return {
        ok: false,
        error:
          "Your account is registered in Primer but not yet enrolled for self-service password reset. Contact HR to enable it.",
      };
    }
    if (/too-many-requests/i.test(msg)) {
      return {
        ok: false,
        error: "Too many reset attempts. Try again in a few minutes.",
      };
    }
    return { ok: false, error: msg };
  }
}
