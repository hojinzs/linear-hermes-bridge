import { expect, test } from "@playwright/test";

const slug = `pw-${Date.now().toString(36)}`;
const wsecret = "wsecret-pw";

test.describe.serial("End-to-end run-jobs flow", () => {
  test("create agent + dev install + webhook → succeeded run job visible", async ({
    page,
    request,
  }) => {
    // 1) create agent via API
    const create = await request.post("/api/agents", {
      data: {
        slug,
        displayName: "PW Agent",
        description: null,
        iconUrl: null,
        linearClientId: "client_xyz",
        linearClientSecret: "cs",
        linearWebhookSecret: wsecret,
        requiredScopes: ["read", "comments:create"],
        hermesConnectorType: "mock",
        hermesConnectorConfig: { kind: "mock" },
        permissionPolicy: {},
      },
    });
    expect(create.status()).toBe(201);

    // 2) dev install
    const install = await request.post(`/oauth/dev/install/${slug}`);
    expect(install.status()).toBe(200);

    // 3) AgentDetail page shows installations
    await page.goto(`/agents/${slug}`);
    await expect(page.getByRole("heading", { name: "Linear installations" })).toBeVisible();
    await expect(page.getByText("Dev Workspace")).toBeVisible();
    await expect(page.getByText("installed")).toBeVisible();

    // 4) trigger webhook → enqueue → orchestrator processes → succeeded
    const body = JSON.stringify({
      type: "AgentSessionEvent",
      action: "prompted",
      deliveryId: `del_pw_${slug}`,
      organizationId: "org_dev",
      agentSession: {
        id: "sess_pw",
        issue: {
          id: "issue_pw",
          identifier: "ENG-PW",
          title: "PW test",
          url: "https://linear.app/x/ENG-PW",
        },
        prompt: "Summarize via playwright smoke",
      },
    });
    const crypto = await import("node:crypto");
    const sig = crypto.createHmac("sha256", wsecret).update(body).digest("hex");
    const wh = await request.post(`/webhooks/linear/${slug}`, {
      headers: { "linear-signature": sig, "content-type": "application/json" },
      data: body,
    });
    expect(wh.status()).toBe(202);

    // 5) Run jobs page shows the job and (after orchestrator tick) succeeded
    await page.goto("/run-jobs");
    await expect(page.getByRole("heading", { name: "Run Jobs" })).toBeVisible();

    // poll up to ~6s for "succeeded" status
    for (let i = 0; i < 12; i++) {
      const r = (await request.get("/api/agent-run-jobs").then((r) => r.json())) as {
        jobs: { status: string }[];
      };
      if (r.jobs[0]?.status === "succeeded") break;
      await new Promise((r) => setTimeout(r, 500));
    }

    await page.getByRole("button", { name: /Refresh/ }).click();
    await expect(page.getByText("agent_session_prompted")).toBeVisible();
    await expect(page.getByText("succeeded")).toBeVisible();

    // 6) Open drawer, see Events with completed
    await page.getByText("agent_session_prompted").first().click();
    await expect(page.getByRole("heading", { name: /Events/ })).toBeVisible();
    await expect(page.getByText("completed")).toBeVisible();
  });
});
