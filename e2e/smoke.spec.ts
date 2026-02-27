import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

// Bottom nav buttons use emoji prefixes: "⚡ Feed", "📅 Cal", "👥 Squads", "⚙ You"
const navButton = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("button", { name: label, exact: true });

test.describe("Smoke tests", () => {
  test("login via magic link lands on feed", async ({ page }) => {
    await loginAsTestUser(page);
    await expect(navButton(page, "⚡ Feed")).toBeVisible({ timeout: 10_000 });
  });

  test("bottom nav tabs are visible and tappable", async ({ page }) => {
    await loginAsTestUser(page);
    await expect(navButton(page, "⚡ Feed")).toBeVisible({ timeout: 10_000 });

    // All four tabs should be visible
    for (const label of ["⚡ Feed", "📅 Cal", "👥 Squads", "⚙ You"]) {
      await expect(navButton(page, label)).toBeVisible();
    }

    // Switch to Cal tab
    await navButton(page, "📅 Cal").click();
    await expect(navButton(page, "📅 Cal")).toBeVisible();

    // Switch to Squads tab
    await navButton(page, "👥 Squads").click();
    await expect(navButton(page, "👥 Squads")).toBeVisible();

    // Switch to You tab
    await navButton(page, "⚙ You").click();
    await expect(navButton(page, "⚙ You")).toBeVisible();

    // Switch back to Feed
    await navButton(page, "⚡ Feed").click();
    await expect(navButton(page, "⚡ Feed")).toBeVisible();
  });
});
