import { expect, test } from "@playwright/test";

// 0.3 baseline smoke — page boots with correct <title> and root mount.
// The placeholder text was replaced in Task 3.3 with the full AppShell.
test("home page boots with correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Linear Hermes Bridge — Admin/);
});
