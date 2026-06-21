import { describe, it, expect } from "vitest";
import {
  compareSemver,
  decideUpdateState,
  normalizeRemoteVersion,
  type LocalVersion,
} from "../appVersion";

describe("compareSemver", () => {
  it("treats 1.10.0 as newer than 1.2.0", () => {
    expect(compareSemver("1.10.0", "1.2.0")).toBeGreaterThan(0);
  });
  it("strips leading v", () => {
    expect(compareSemver("v2.0.1", "2.0.1")).toBe(0);
    expect(compareSemver("V2.1.0", "2.0.9")).toBeGreaterThan(0);
  });
  it("missing segments default to 0", () => {
    expect(compareSemver("1", "1.0.0")).toBe(0);
    expect(compareSemver("1.0", "1.0.1")).toBeLessThan(0);
  });
  it("equal versions return 0", () => {
    expect(compareSemver("3.4.5", "3.4.5")).toBe(0);
  });
});

describe("normalizeRemoteVersion", () => {
  it("returns null for null/undefined", () => {
    expect(normalizeRemoteVersion(null)).toBeNull();
    expect(normalizeRemoteVersion(undefined)).toBeNull();
  });
  it("accepts a legacy string shape", () => {
    const out = normalizeRemoteVersion("1.4.2");
    expect(out).not.toBeNull();
    expect(out!.latestVersion).toBe("1.4.2");
    expect(out!.minimumVersion).toBe("1.4.2");
    expect(out!.forceUpdate).toBe(false);
  });
  it("accepts the full object shape", () => {
    const out = normalizeRemoteVersion({
      latestVersion: "2.0.0",
      minimumVersion: "1.5.0",
      forceUpdate: true,
      releaseNotes: ["a", "b"],
      downloadUrl: "https://x",
      updatedAt: 123,
    });
    expect(out!.latestVersion).toBe("2.0.0");
    expect(out!.forceUpdate).toBe(true);
    expect(out!.releaseNotes).toEqual(["a", "b"]);
    expect(out!.downloadUrl).toBe("https://x");
    expect(out!.updatedAt).toBe(123);
  });
  it("returns null for malformed object without a version", () => {
    expect(normalizeRemoteVersion({ foo: "bar" })).toBeNull();
  });
  it("coerces a string releaseNotes into an array", () => {
    const out = normalizeRemoteVersion({
      latestVersion: "1.0.0",
      releaseNotes: "single note",
    });
    expect(out!.releaseNotes).toEqual(["single note"]);
  });
});

describe("decideUpdateState", () => {
  const local: LocalVersion = { version: "1.2.0", build: "10", platform: "android" };

  it("returns ok when no remote info", () => {
    expect(decideUpdateState(local, null).status).toBe("ok");
  });
  it("returns ok when already up-to-date", () => {
    const d = decideUpdateState(local, normalizeRemoteVersion({
      latestVersion: "1.2.0",
      minimumVersion: "1.0.0",
    })!);
    expect(d.status).toBe("ok");
  });
  it("returns optional when behind latest but above minimum", () => {
    const d = decideUpdateState(local, normalizeRemoteVersion({
      latestVersion: "1.3.0",
      minimumVersion: "1.0.0",
    })!);
    expect(d.status).toBe("optional");
  });
  it("forced when below minimum", () => {
    const d = decideUpdateState(local, normalizeRemoteVersion({
      latestVersion: "1.3.0",
      minimumVersion: "1.2.5",
    })!);
    expect(d.status).toBe("forced");
  });
  it("forceUpdate flag overrides optional → forced", () => {
    const d = decideUpdateState(local, normalizeRemoteVersion({
      latestVersion: "1.3.0",
      minimumVersion: "1.0.0",
      forceUpdate: true,
    })!);
    expect(d.status).toBe("forced");
  });
});
