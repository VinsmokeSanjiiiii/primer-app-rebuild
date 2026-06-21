/**
 * OTP-based forgot-password flow.
 *
 * The original Android app used a custom OTP-by-email flow. This implementation
 * uses a Supabase Edge Function to generate, store, and verify 6-digit OTPs.
 *
 * Flow:
 *   1. User enters their Primer email.
 *   2. We verify the account exists in the legacy /Users node.
 *   3. We call the OTP edge function to generate and send a 6-digit OTP.
 *   4. User enters the OTP.
 *   5. We verify the OTP via the edge function.
 *   6. User sets a new password.
 *   7. We update the password in the /Users node for legacy compatibility.
 *
 * NOTE: The legacy app stored passwords as plain strings under /Users/{id}/Password.
 * After a successful reset, the user should also update the /Users/{id}/Password
 * mirror through the in-app "Change password" flow so attendance, OT, and coverage
 * continue to authenticate with the legacy system.
 */
import { get, query, ref, orderByChild, equalTo, update } from "firebase/database";
import { getDb } from "../data/firebase";

export interface ResetResult {
  ok: boolean;
  error?: string;
  verifyToken?: string;
  devOtp?: string; // Only in development
}

const OTP_FUNCTION_URL = "/api/password-reset-otp";

/**
 * Verify the email exists in the legacy /Users node before sending OTP.
 */
async function verifyEmailExists(email: string): Promise<string | null> {
  const db = getDb();

  // Try exact match first
  const exactQ = query(
    ref(db, "Users"),
    orderByChild("Primer_Email"),
    equalTo(email),
  );
  const exactSnap = await get(exactQ);
  if (exactSnap.exists()) {
    const data = exactSnap.val() as Record<string, { Employee_ID_Number?: string }>;
    const firstKey = Object.keys(data)[0];
    return data[firstKey]?.Employee_ID_Number ?? firstKey ?? null;
  }

  // Try case-insensitive scan
  const allSnap = await get(ref(db, "Users"));
  if (!allSnap.exists()) return null;

  const all = allSnap.val() as Record<string, { Primer_Email?: string; Employee_ID_Number?: string }>;
  for (const [id, rec] of Object.entries(all)) {
    if (
      typeof rec?.Primer_Email === "string" &&
      rec.Primer_Email.trim().toLowerCase() === email.toLowerCase()
    ) {
      return rec.Employee_ID_Number ?? id;
    }
  }

  return null;
}

/**
 * Request a 6-digit OTP to be sent to the user's email.
 */
export async function requestPasswordReset(rawEmail: string): Promise<ResetResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    // Verify the account exists in the legacy /Users node
    const employeeId = await verifyEmailExists(rawEmail.trim());
    if (!employeeId) {
      return {
        ok: false,
        error: "No Primer account is registered with that email.",
      };
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
    const response = await fetch(OTP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || "Failed to send OTP. Please try again.",
      };
    }

    return {
      ok: true,
      devOtp: data.devOtp, // Only populated in development
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Network error: ${e.message}` : "Network error. Please try again.",
    };
  }
}

/**
 * Verify the OTP entered by the user.
 */
export async function verifyOTP(rawEmail: string, otp: string): Promise<ResetResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return { ok: false, error: "Enter the 6-digit OTP sent to your email." };
  }

  try {
    const response = await fetch(OTP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", email, otp }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || "Invalid OTP. Please try again.",
      };
    }

    return {
      ok: true,
      verifyToken: data.verifyToken,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Network error: ${e.message}` : "Network error. Please try again.",
    };
  }
}

/**
 * Reset the password after OTP verification.
 */
export async function resetPassword(
  rawEmail: string,
  newPassword: string,
  verifyToken: string,
): Promise<ResetResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (!verifyToken) {
    return { ok: false, error: "Verification token is missing. Please verify your OTP again." };
  }

  try {
    const response = await fetch(OTP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", email, newPassword, verifyToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || "Failed to reset password. Please try again.",
      };
    }

    // Also update the legacy /Users/{id}/Password field
    const employeeId = await verifyEmailExists(email);
    if (employeeId) {
      const db = getDb();
      await update(ref(db, `Users/${employeeId}`), { Password: newPassword });
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Network error: ${e.message}` : "Network error. Please try again.",
    };
  }
}
