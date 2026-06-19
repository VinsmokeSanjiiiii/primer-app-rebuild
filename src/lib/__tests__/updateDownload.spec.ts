import { describe, it, expect, vi } from "vitest";
import { runLiveUpdate } from "../updateDownload";

function makeMockModule(opts: {
  syncImpl?: (cb?: (p: number) => void) => Promise<{ activeApplicationPathChanged: boolean }>;
}) {
  // Cast through unknown to satisfy the strict module type without
  // implementing every Live Updates export the test doesn't use.
  return {
    sync: opts.syncImpl ?? (async () => ({ activeApplicationPathChanged: false })),
    reload: vi.fn(async () => {}),
    setConfig: vi.fn(async () => {}),
    getConfig: vi.fn(async () => ({}) as never),
    resetConfig: vi.fn(async () => {}),
    default: {} as never,
  } as unknown as typeof import("@capacitor/live-updates");
}

describe("runLiveUpdate", () => {
  it("reports unsupported when not running in Capacitor native", async () => {
    const events: string[] = [];
    const r = await runLiveUpdate({
      onProgress: (e) => events.push(e.kind),
    });
    expect(r.ok).toBe(false);
    expect(r.unsupported).toBe(true);
    expect(events).toContain("unsupported");
  });

  it("emits progress and applied when sync changes the bundle", async () => {
    // Pretend we're on native.
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    const events: string[] = [];
    const mod = makeMockModule({
      syncImpl: async (cb) => {
        cb?.(0);
        cb?.(0.5);
        cb?.(1);
        return { activeApplicationPathChanged: true };
      },
    });
    const r = await runLiveUpdate({
      onProgress: (e) => events.push(e.kind),
      liveUpdatesModule: mod,
    });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    expect(events).toContain("start");
    expect(events.filter((e) => e === "progress").length).toBeGreaterThan(0);
    expect(events).toContain("applied");
    (globalThis as { Capacitor?: unknown }).Capacitor = undefined;
  });

  it("surfaces a network failure cleanly", async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    const events: string[] = [];
    const mod = makeMockModule({
      syncImpl: async () => {
        throw new Error("network down");
      },
    });
    const r = await runLiveUpdate({
      onProgress: (e) => events.push(e.kind),
      liveUpdatesModule: mod,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/network/i);
    expect(events).toContain("error");
    (globalThis as { Capacitor?: unknown }).Capacitor = undefined;
  });
});
