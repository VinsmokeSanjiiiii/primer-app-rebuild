import { Capacitor } from "@capacitor/core";

/**
 * Opens a URL outside the current SPA context.
 *
 * On Capacitor native platforms we use the Browser plugin (in-app browser tab)
 * which is the only reliable way to view attachments without unloading the
 * web view and restarting the React app. On the web we fall back to a
 * standard new-tab open.
 */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
      return;
    }
  } catch {
    /* fall through to window.open */
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* no-op */
  }
}
