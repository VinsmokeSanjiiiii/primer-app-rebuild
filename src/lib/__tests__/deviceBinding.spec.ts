import { describe, it, expect, beforeEach } from "vitest";
import {
  bindingMatches,
  getCachedBindingId,
  getOrCreateBindingId,
  __resetBindingCacheForTests,
} from "../deviceBinding";

beforeEach(() => {
  localStorage.clear();
  __resetBindingCacheForTests();
});

describe("deviceBinding", () => {
  it("creates and persists an id on first call", async () => {
    const a = await getOrCreateBindingId();
    expect(a).toMatch(/[a-z0-9-]+/i);
    expect(localStorage.getItem("primer_device_binding_id_v1")).toBe(a);
  });

  it("reuses the same id across calls", async () => {
    const a = await getOrCreateBindingId();
    __resetBindingCacheForTests();
    const b = await getOrCreateBindingId();
    expect(b).toBe(a);
  });

  it("returns cached id synchronously after first await", async () => {
    expect(getCachedBindingId()).toBeNull();
    const a = await getOrCreateBindingId();
    expect(getCachedBindingId()).toBe(a);
  });

  it("bindingMatches returns false on missing inputs", () => {
    expect(bindingMatches(null, null)).toBe(false);
    expect(bindingMatches("a", null)).toBe(false);
    expect(bindingMatches(null, "a")).toBe(false);
    expect(bindingMatches("", "")).toBe(false);
  });

  it("bindingMatches returns true only on exact match", () => {
    expect(bindingMatches("a", "a")).toBe(true);
    expect(bindingMatches("a", "b")).toBe(false);
  });
});
