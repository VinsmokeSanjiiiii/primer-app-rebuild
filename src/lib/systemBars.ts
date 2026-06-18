// Theme the Android (and iOS) native system bars so they match the in-app
// light/dark theme instead of rendering as blank black/white strips.
//
// Safe to call on web — every call no-ops unless running inside Capacitor.

import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NavigationBar } from "@hugotomazi/capacitor-navigation-bar";

// Match the in-app surface colors used by AppBar / bottom nav.
// Light: white-ish (slate-50 #f8fafc), Dark: slate-950 #020617.
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0f172a"; // slate-900 — matches the bottom nav/appbar dark background

let lastApplied: boolean | null = null;

export async function applySystemBars(dark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (lastApplied === dark) return;
  lastApplied = dark;

  const bg = dark ? DARK_BG : LIGHT_BG;

  try {
    // Status bar: do NOT overlay the webview — we want the bar to actually
    // render as a colored strip with the OS clock/battery on top.
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: bg });
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    // Plugin unavailable (e.g. iOS-only build of @hugotomazi): swallow.
  }

  try {
    // Android navigation bar (back/home/recents area).
    await NavigationBar.setColor({ color: bg, darkButtons: !dark });
  } catch {
    // iOS / older Android — ignore.
  }
}
