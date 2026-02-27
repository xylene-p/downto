import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Squad chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page.getByText("Feed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("open squad, see chat, send message, go back", async ({ page }) => {
    // Navigate to Squads tab
    await page.getByRole("button", { name: /Squads/ }).click();

    // Should see the "Drinks Crew" squad from seed data
    const squadCard = page.getByText("Drinks Crew");
    await expect(squadCard).toBeVisible({ timeout: 5_000 });

    // Click to open the squad chat
    await squadCard.click();

    // Chat should open — message input should be visible
    const messageInput = page.getByPlaceholder(/message/i);
    await expect(messageInput).toBeVisible({ timeout: 5_000 });

    // Should see existing messages from seed data
    await expect(page.getByText("where should we meet")).toBeVisible();

    // Send a new message
    await messageInput.fill("sounds good, see you there!");
    await messageInput.press("Enter");

    // New message should appear in chat
    await expect(page.getByText("sounds good, see you there!")).toBeVisible({
      timeout: 5_000,
    });

    // Go back to squad list — click the back button
    const backButton = page.getByText("←");
    if (await backButton.isVisible()) {
      await backButton.click();
    } else {
      // Fallback: click the Squads nav tab to return to list
      await page.getByRole("button", { name: /Squads/ }).click();
    }

    // Squad list should be visible again
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });
});
