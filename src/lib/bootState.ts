// Central startup / update state machine.
//
// One source of truth that the UpdateGate (and anything else) can consume.
// Replaces ad-hoc booleans scattered across the app with explicit, testable
// states.

import { useEffect, useState } from "react";
import {
  acknowledgeVersion,
  checkForUpdate,
  isAcknowledged,
  type AppVersionInfo,
  type UpdateCheckResult,
} from "./updateCheck";

export type BootStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "updateAvailable"
  | "mandatoryUpdate"
  | "downloading"
  | "installing"
  | "fallbackAvailable"
  | "error"
  | "offlineCached";

export interface BootState {
  status: BootStatus;
  info?: AppVersionInfo;
  result?: UpdateCheckResult;
  progress: number | null; // null = indeterminate
  errorMessage?: string;
  warning?: string;
  acknowledgedCurrent: boolean;
}

const INITIAL: BootState = {
  status: "idle",
  progress: 0,
  acknowledgedCurrent: false,
};

type Listener = (state: BootState) => void;

class BootController {
  private state: BootState = INITIAL;
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;

  getState(): BootState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<BootState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Idempotent — concurrent callers share the same in-flight check. */
  async check(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.set({ status: "checking", errorMessage: undefined });
    this.inflight = (async () => {
      const result = await checkForUpdate();
      const info = result.info;
      const acknowledgedCurrent = info
        ? isAcknowledged(info.currentVersion)
        : false;

      let status: BootStatus;
      if (!result.ok) {
        status = "error";
      } else if (result.mandatory) {
        status = "mandatoryUpdate";
      } else if (result.updateAvailable) {
        status = acknowledgedCurrent ? "upToDate" : "updateAvailable";
      } else {
        status = result.source === "cache" ? "offlineCached" : "upToDate";
      }

      this.set({
        status,
        info,
        result,
        warning: result.warning,
        errorMessage: result.error,
        acknowledgedCurrent,
      });
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  setDownloading(pct: number | null = 0): void {
    this.set({ status: "downloading", progress: pct, errorMessage: undefined });
  }

  setInstalling(): void {
    this.set({ status: "installing", progress: 100 });
  }

  setFallback(message: string): void {
    this.set({ status: "fallbackAvailable", errorMessage: message });
  }

  setError(message: string): void {
    this.set({ status: "error", errorMessage: message });
  }

  async acknowledge(employeeId?: string): Promise<void> {
    const v = this.state.info?.currentVersion;
    if (!v) return;
    await acknowledgeVersion(v, "update_modal", employeeId);
    this.set({ acknowledgedCurrent: true });
    // If user dismissed a non-mandatory available update, treat as up-to-date
    // for this session.
    if (this.state.status === "updateAvailable") {
      this.set({ status: "upToDate" });
    }
  }

  reset(): void {
    this.state = INITIAL;
    for (const l of this.listeners) l(this.state);
  }
}

export const bootController = new BootController();

export function useBootState(): BootState {
  const [state, setState] = useState<BootState>(bootController.getState());
  useEffect(() => bootController.subscribe(setState), []);
  return state;
}

/**
 * Convenience hook: triggers a check on mount, on tab visibility change, and
 * on resume from background. Safe to call from multiple components — the
 * controller deduplicates concurrent checks.
 */
export function useStartupVersionCheck(): BootState {
  const state = useBootState();
  useEffect(() => {
    void bootController.check();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void bootController.check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return state;
}
