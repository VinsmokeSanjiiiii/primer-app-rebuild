// Local app version, injected at build time from package.json via vite `define`.
// Keep this in sync with android/app/build.gradle `versionName`.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __APP_VERSION__ !== "undefined" && (__APP_VERSION__ as any)) ||
  (import.meta.env.VITE_APP_VERSION as string) ||
  "1.0.0";

/** Compares two semver-ish strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((s) => parseInt(s, 10) || 0);
  const pb = b.split(/[.\-+]/).map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}
