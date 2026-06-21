/**
 * Lightweight, namespaced logger for the new version / binding /
 * biometric / update flows. Gated by Vite's DEV flag so production
 * builds stay quiet, but errors always surface.
 *
 * Never log secrets, passwords, tokens, or raw credentials.
 */

const DEV =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

type Scope = "appVersion" | "binding" | "biometric" | "update";

function fmt(scope: Scope, level: string, args: unknown[]): unknown[] {
  return [`[${scope}:${level}]`, ...args];
}

export const log = {
  debug(scope: Scope, ...args: unknown[]): void {
    if (!DEV) return;
    // eslint-disable-next-line no-console
    console.debug(...fmt(scope, "debug", args));
  },
  info(scope: Scope, ...args: unknown[]): void {
    if (!DEV) return;
    // eslint-disable-next-line no-console
    console.info(...fmt(scope, "info", args));
  },
  warn(scope: Scope, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(...fmt(scope, "warn", args));
  },
  error(scope: Scope, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(...fmt(scope, "error", args));
  },
};
