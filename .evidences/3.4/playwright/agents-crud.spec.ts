import { expect, test } from "@playwright/test";

const slug = `e2e-${Date.now().toString(36)}`;

test.describe.serial("Agent CRUD UI", () => {
  test("empty state shows seed hint", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.getByRole("link", { name: /New agent/ })).toBeVisible();
    await expect(page.getByText(/No agents yet/)).toBeVisible();
  });

  test("create agent via form, then list and detail show it", async ({ page }) => {
    await page.goto("/agents/new");
    await expect(page.getByRole("heading", { name: "New agent" })).toBeVisible();

    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Display name").fill("E2E Agent");
    await page.getByLabel("Description").fill("created by playwright");
    await page.getByLabel("Linear client ID").fill("client-id");
    await page.getByLabel("Linear client secret").fill("client-secret");
    await page.getByLabel("Linear webhook secret").fill("webhook-secret");

    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(new RegExp(`/agents/${slug}$`));
    await expect(page.getByRole("heading", { name: "E2E Agent" })).toBeVisible();
    await expect(page.getByText(/Callback/)).toBeVisible();
    await expect(page.getByText(/Webhook/)).toBeVisible();
    await expect(page.getByText(/Install/)).toBeVisible();
    await expect(page.getByText(`http://localhost:5173/oauth/callback/${slug}`)).toBeVisible();
  });

  test("disable / enable toggles status badge", async ({ page }) => {
    await page.goto(`/agents/${slug}`);
    await expect(page.getByRole("button", { name: "Disable" })).toBeVisible();
    await page.getByRole("button", { name: "Disable" }).click();
    await expect(page.getByRole("button", { name: "Enable" })).toBeVisible();
    await page.getByRole("button", { name: "Enable" }).click();
    await expect(page.getByRole("button", { name: "Disable" })).toBeVisible();
  });

  test("agents list shows the new row", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("cell", { name: slug })).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E Agent" })).toBeVisible();
  });
});
