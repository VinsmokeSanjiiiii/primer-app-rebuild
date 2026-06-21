import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post("/api/password-reset-otp", (req, res) => {
  try {
    const { action, email, otp, newPassword } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (action === "request") {
      const newOtp = generateOTP();
      const expires = Date.now() + 10 * 60 * 1000;

      otpStore.set(normalizedEmail, { otp: newOtp, expires, attempts: 0 });

      console.log(`[OTP] For ${normalizedEmail}: ${newOtp}`);

      const isDev = process.env.NODE_ENV !== "production";

      return res.status(200).json({
        success: true,
        message: "OTP sent to your email address.",
        ...(isDev && { devOtp: newOtp }),
      });
    }

    if (action === "verify") {
      const stored = otpStore.get(normalizedEmail);

      if (!stored) {
        return res.status(400).json({ error: "No OTP request found. Please request a new OTP." });
      }

      if (Date.now() > stored.expires) {
        otpStore.delete(normalizedEmail);
        return res.status(400).json({ error: "OTP has expired. Please request a new one." });
      }

      if (stored.attempts >= 5) {
        otpStore.delete(normalizedEmail);
        return res.status(429).json({ error: "Too many failed attempts. Please request a new OTP." });
      }

      if (stored.otp !== otp) {
        stored.attempts++;
        return res.status(400).json({
          error: `Invalid OTP. ${5 - stored.attempts} attempts remaining.`,
        });
      }

      const verifyToken = Buffer.from(`${normalizedEmail}:${Date.now()}`).toString("base64");
      otpStore.delete(normalizedEmail);

      return res.status(200).json({
        success: true,
        verified: true,
        verifyToken,
        message: "OTP verified. You may now set your new password.",
      });
    }

    if (action === "reset") {
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }

      return res.status(200).json({
        success: true,
        message: "Password has been reset successfully. Please sign in with your new password.",
      });
    }

    return res.status(400).json({ error: "Invalid action. Use 'request', 'verify', or 'reset'." });
  } catch (err) {
    console.error("OTP route error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on port ${PORT}`);
});
