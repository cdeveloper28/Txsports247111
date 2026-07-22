/**
 * Share helpers for bets and match results. Uses the native Web Share sheet where available
 * (mobile), falls back to copying to the clipboard, and offers an X / Twitter web-intent URL.
 */
export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function shareLink(text: string, url?: string): Promise<ShareResult> {
  const full = url ? `${text}\n${url}` : text;
  const nav = navigator as any;
  if (nav.share) {
    try {
      await nav.share({ title: "Txsports", text, url });
      return "shared";
    } catch (e: any) {
      if (e && e.name === "AbortError") return "cancelled"; // user closed the sheet
      // any other failure: fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(full);
    return "copied";
  } catch {
    return "failed";
  }
}

/** X / Twitter web-intent URL. */
export function xIntentUrl(text: string, url?: string): string {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  if (url) u.searchParams.set("url", url);
  return u.toString();
}

/** Deep link back to a fixture's market on this deployment. */
export function marketUrl(fixtureId: number): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/#/app/${fixtureId}`;
}
