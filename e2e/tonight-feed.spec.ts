import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Tonight feed", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page.getByText("Feed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Tonight tab shows today's events only", async ({ page }) => {
    // Switch to "Tonight ✶" sub-tab
    const tonightTab = page.getByText("Tonight", { exact: false });
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
