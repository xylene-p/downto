import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const navButton = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`${label}$`) });

test.describe("Tonight feed", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await expect(navButton(page, "Feed")).toBeVisible({ timeout: 10_000 });
  });

  test("Tonight tab shows today's events only", async ({ page }) => {
    // Click the "Tonight ✶" sub-tab button
    const tonightTab = page.getByRole("button", { name: /Tonight ✶/ });
    await expect(tonightTab).toBeVisible({ timeout: 5_000 });
    await tonightTab.click();

    // Should see today's event from seed data
    await expect(page.getByText("Test Night Out")).toBeVisible({
      timeout: 5_000,
    });

    // Tomorrow's event should NOT appear
    await expect(page.getByText("Tomorrow Hangout")).not.toBeVisible();
  });
});
