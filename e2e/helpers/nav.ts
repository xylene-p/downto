import type { Page } from "@playwright/test";

/**
 * Get a bottom nav button by its label.
 * Bottom nav buttons have accessible names like "⚡ Feed", "📅 Cal", etc.
 * We match buttons whose name is short (emoji + label) to avoid matching
 * content buttons like "Save to Cal".
 */
export function navButton(page: Page, label: string) {
  // The nav buttons are rendered as: <button><span>{emoji} {label}</span></button>
  // Match buttons where the name is just 1-2 chars (emoji) + space + label
  return page.locator(`button >> text=/^.{1,2}\\s${label}$/`);
}

/**
 * Wait for the app to finish loading after auth.
 * Looks for the bottom nav container to be visible.
 */
export async function waitForAppLoaded(page: Page) {
  // Wait for any of the nav labels to appear — these only render once logged in
  await page.waitForFunction(
    () => document.body.innerText.includes("Squads"),
    { timeout: 15_000 }
  );
}
