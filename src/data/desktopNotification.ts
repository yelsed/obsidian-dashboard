import { Notice } from "obsidian";

export function announceToUser(titleText: string, bodyText: string): void {
  new Notice(`${titleText} — ${bodyText}`);

  if (typeof Notification === "undefined") {
    return;
  }

  // Obsidian's Electron renderer normally grants notification permission implicitly, but a
  // host that denies it throws on construction rather than returning a falsy value. The
  // Notice above has already reached the user, so swallowing that is safe.
  try {
    new Notification(titleText, { body: bodyText });
  } catch {
    return;
  }
}
