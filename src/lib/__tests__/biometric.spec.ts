import { describe, it, expect, beforeEach } from "vitest";
import {
  clearEnrolledBiometric,
  hasEnrolledBiometric,
  isWebAuthnSupported,
  verifyBiometric,
} from "../biometric";

beforeEach(() => {
  localStorage.clear();
});

describe("biometric (no WebAuthn in jsdom)", () => {
  it("isWebAuthnSupported returns false without PublicKeyCredential", () => {
    expect(isWebAuthnSupported()).toBe(false);
  });

  it("verifyBiometric returns unsupported when WebAuthn is missing", async () => {
    const r = await verifyBiometric();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported");
  });

  it("clearEnrolledBiometric is a no-op on empty storage", () => {
    expect(() => clearEnrolledBiometric()).not.toThrow();
    expect(hasEnrolledBiometric()).toBe(false);
  });

  it("corrupt JSON in storage doesn't throw and reports not enrolled", () => {
    localStorage.setItem("primer_biometric_credential_v1", "{not json");
    expect(hasEnrolledBiometric()).toBe(false);
  });
});
