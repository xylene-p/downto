import type { Page, Locator } from "@playwright/test";

/**
 * Get a bottom nav button by its label.
 * Uses text content matching — the nav buttons render as "{emoji} {Label}"
 * inside a span within a button.
 */
export function navButton(page: Page, label: string): Locator {
  // Target the specific span inside the button that contains the nav label
  // The span text is like "⚡ Feed", "📅 Cal", "👥 Squads", "⚙ You"
  return page.locator(`button`).filter({ hasText: new RegExp(`^.\\s${label}$`) });
}

/**
 * Wait for the app to finish loading after auth.
 * Checks that the page URL is on the app and waits for hydration.
 */
export async function waitForAppLoaded(page: Page) {
  // The page loads at http://...:3000/# after auth — just wait for hydration
  await page.waitForTimeout(3_000);
}
