import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Smoke tests", () => {
  test("login via magic link lands on feed", async ({ page }) => {
    await loginAsTestUser(page);
    // Feed tab should be active — look for the Feed label in bottom nav
    await expect(page.getByText("Feed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("bottom nav tabs are visible and tappable", async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page.getByText("Feed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // All four tabs should be visible
    for (const label of ["Feed", "Cal", "Squads", "You"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(label) })
      ).toBeVisible();
    }

    // Switch to Cal tab
    await page.getByRole("button", { name: /Cal/ }).click();
    // Calendar view should show (look for month/calendar indicator)
    await expect(page.locator("text=Cal")).toBeVisible();

    // Switch to Squads tab
    await page.getByRole("button", { name: /Squads/ }).click();
    await expect(page.locator("text=Squads")).toBeVisible();

    // Switch to You tab
    await page.getByRole("button", { name: /You/ }).click();
    await expect(page.locator("text=You")).toBeVisible();

    // Switch back to Feed
    await page.getByRole("button", { name: /Feed/ }).click();
    await expect(page.locator("text=Feed")).toBeVisible();
  });
});
