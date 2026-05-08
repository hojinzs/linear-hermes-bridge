import { expect, test } from "@playwright/test";

test("home page renders Mantine placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Linear Hermes Bridge — Admin/);
  await expect(page.getByText("Linear Hermes Bridge — Admin (placeholder)")).toBeVisible();
});
