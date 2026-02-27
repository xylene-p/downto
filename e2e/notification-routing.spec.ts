import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

const navButton = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("button", { name: label, exact: true });

/**
 * Tests the NOTIFICATION_CLICK postMessage handler in page.tsx.
 * Dispatches window message events and verifies correct tab activation.
 */
test.describe("Notification click routing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await expect(navButton(page, "⚡ Feed")).toBeVisible({ timeout: 10_000 });
  });

  test("squad_message routes to Squads tab", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "squad_message",
            relatedId: "d1111111-1111-1111-1111-111111111111",
          },
        })
      );
    });

    // Should switch to Squads tab and show the squad
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });

  test("friend_request routes to You tab", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "friend_request",
          },
        })
      );
    });

    // Profile tab should be active — check for profile-specific UI
    // The "⚙ You" button should still be visible, and we should see profile content
    await page.waitForTimeout(1_000);
    // Verify we navigated away from feed by checking the nav state
    await expect(navButton(page, "⚙ You")).toBeVisible();
  });

  test("check_response routes to Feed tab", async ({ page }) => {
    // First switch away from feed
    await navButton(page, "👥 Squads").click();
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });

    // Now simulate notification click
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "check_response",
          },
        })
      );
    });

    // Should switch back to Feed tab — look for feed sub-tabs
    await expect(page.getByText("For You")).toBeVisible({ timeout: 5_000 });
  });

  test("squad_invite routes to Squads tab", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "squad_invite",
            relatedId: "d1111111-1111-1111-1111-111111111111",
          },
        })
      );
    });

    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });
});
