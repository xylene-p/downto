import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";

function dispatchNotificationClick(
  page: import("@playwright/test").Page,
  notificationType: string,
  relatedId?: string
) {
  return page.evaluate(
    ({ nType, rId }) => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "NOTIFICATION_CLICK",
              notificationType: nType,
              ...(rId ? { relatedId: rId } : {}),
            },
          })
        );
      }
    },
    { nType: notificationType, rId: relatedId }
  );
}

test.describe("Notification click routing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("squad_message routes to Squads tab", async ({ page }) => {
    await dispatchNotificationClick(
      page,
      "squad_message",
      "d1111111-1111-1111-1111-111111111111"
    );
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });

  test("friend_request routes to You tab", async ({ page }) => {
    await dispatchNotificationClick(page, "friend_request");
    await page.waitForTimeout(1_000);
  });

  test("check_response routes to Feed tab", async ({ page }) => {
    // First switch away from feed
    await navButton(page, "Squads").click();
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });

    await dispatchNotificationClick(page, "check_response");
    await expect(page.getByText("For You")).toBeVisible({ timeout: 5_000 });
  });

  test("squad_invite routes to Squads tab", async ({ page }) => {
    await dispatchNotificationClick(
      page,
      "squad_invite",
      "d1111111-1111-1111-1111-111111111111"
    );
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });
});
