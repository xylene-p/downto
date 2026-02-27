import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

/**
 * Tests the NOTIFICATION_CLICK postMessage handler in page.tsx.
 * Instead of real push notifications, we dispatch postMessage events
 * and verify the correct tab is activated.
 */
test.describe("Notification click routing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    // Wait for feed to load
    await expect(page.getByText("Feed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("squad_message routes to Squads tab", async ({ page }) => {
    // Dispatch NOTIFICATION_CLICK via service worker message simulation
    await page.evaluate(() => {
      navigator.serviceWorker?.controller?.postMessage?.({
        type: "NOTIFICATION_CLICK",
        notificationType: "squad_message",
        relatedId: "s1111111-1111-1111-1111-111111111111",
      });
      // Fallback: dispatch directly on the window message event
      // (service worker may not be registered in test)
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "squad_message",
            relatedId: "s1111111-1111-1111-1111-111111111111",
          },
        })
      );
    });

    // Should switch to Squads tab
    const squadsButton = page.getByRole("button", { name: /Squads/ });
    await expect(squadsButton).toBeVisible();
    // Verify the squads tab is now active (accent color)
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

    // Should switch to You/profile tab
    await expect(page.getByRole("button", { name: /You/ })).toBeVisible();
    // Verify we're on the profile view — look for profile-specific content
    await expect(page.getByText("You")).toBeVisible({ timeout: 5_000 });
  });

  test("check_response routes to Feed tab", async ({ page }) => {
    // First switch away from feed
    await page.getByRole("button", { name: /Squads/ }).click();
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

    // Should switch back to Feed tab
    await expect(page.getByText("For You")).toBeVisible({ timeout: 5_000 });
  });

  test("squad_invite routes to Squads tab", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "NOTIFICATION_CLICK",
            notificationType: "squad_invite",
            relatedId: "s1111111-1111-1111-1111-111111111111",
          },
        })
      );
    });

    // Should switch to Squads tab
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });
});
