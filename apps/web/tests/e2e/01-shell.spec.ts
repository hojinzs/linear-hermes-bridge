import { expect, test } from "@playwright/test";

test.describe("App shell", () => {
  test("redirects / to /agents", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/agents$/);
  });

  test("header, nav, dev banner are visible", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Linear Hermes Bridge" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Agents/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Run Jobs/ })).toBeVisible();
    await expect(page.getByText("Development build")).toBeVisible();
    await expect(page.getByText(/auth not implemented/)).toBeVisible();
  });

  test("Run Jobs nav navigates to /run-jobs", async ({ page }) => {
    await page.goto("/agents");
    await page.getByRole("link", { name: /Run Jobs/ }).click();
    await expect(page).toHaveURL(/\/run-jobs$/);
    await expect(page.getByRole("heading", { name: "Run Jobs" })).toBeVisible();
  });

  test("page renders real agents pages at /agents and /agents/new", async ({ page }) => {
    // After Task 3.4, stubs are replaced with real pages. Validate landmark headings.
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await page.goto("/agents/new");
    await expect(page.getByRole("heading", { name: "New agent" })).toBeVisible();
  });
});
