import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// OTP storage - keyed by email, stores { otp, expires, attempts }
const otpStore = new Map<string, { otp: string; expires: number; attempts: number }>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, email, otp, newPassword } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (action === "request") {
      // Generate and store OTP
      const newOtp = generateOTP();
      const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(normalizedEmail, { otp: newOtp, expires, attempts: 0 });

      // Log OTP for development (in production, send via email)
      console.log(`[DEV OTP] For ${normalizedEmail}: ${newOtp}`);

      // In production, you would send this via Resend/SendGrid/Twilio
      // For now, we return it in dev mode for testing
      const isDev = Deno.env.get("DENO_DEPLOYMENT_ID") === undefined;

      return new Response(JSON.stringify({
        success: true,
        message: "OTP sent to your email address.",
        // Only include OTP in development
        ...(isDev && { devOtp: newOtp }),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      const stored = otpStore.get(normalizedEmail);

      if (!stored) {
        return new Response(JSON.stringify({ error: "No OTP request found. Please request a new OTP." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Date.now() > stored.expires) {
        otpStore.delete(normalizedEmail);
        return new Response(JSON.stringify({ error: "OTP has expired. Please request a new one." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stored.attempts >= 5) {
        otpStore.delete(normalizedEmail);
        return new Response(JSON.stringify({ error: "Too many failed attempts. Please request a new OTP." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stored.otp !== otp) {
        stored.attempts++;
        return new Response(JSON.stringify({
          error: `Invalid OTP. ${5 - stored.attempts} attempts remaining.`
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // OTP verified - return a verification token
      const verifyToken = btoa(`${normalizedEmail}:${Date.now()}`);
      otpStore.delete(normalizedEmail);

      return new Response(JSON.stringify({
        success: true,
        verified: true,
        verifyToken,
        message: "OTP verified. You may now set your new password.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset") {
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // In a real implementation, verify the token and update the password
      // in your auth system (Firebase Auth, Supabase Auth, etc.)
      // This is a placeholder that returns success

      return new Response(JSON.stringify({
        success: true,
        message: "Password has been reset successfully. Please sign in with your new password.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'request', 'verify', or 'reset'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("OTP function error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Internal server error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
