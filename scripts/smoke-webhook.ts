#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const port = Number(process.env.PORT ?? 8787);
const baseUrl = `http://127.0.0.1:${port}`;
const webhookSecret = "dev-webhook-secret";
const slug = "mock-agent";

const args = new Set(process.argv.slice(2));
const slow = args.has("--slow");
const badSig = args.has("--bad-sig");

async function main() {
  const fixturePath = join(repoRoot, "apps", "bridge", "fixtures", "agent-session-prompted.json");
  if (!existsSync(fixturePath)) {
    console.error(`[smoke] fixture missing: ${fixturePath}`);
    process.exit(1);
  }
  let body = readFileSync(fixturePath, "utf8");

  // Make slow runs unique to avoid dedupe collisions across re-runs, and append
  // the slow marker to the prompt so the mock connector runs this one job slowly
  // (5s) — long enough to cancel it mid-flight. The marker must match
  // SMOKE_SLOW_MARKER in apps/bridge/src/hermes/mockConnector.ts.
  if (slow) {
    const obj = JSON.parse(body) as Record<string, unknown>;
    obj.deliveryId = `del_slow_${Date.now()}`;
    const session = obj.agentSession as Record<string, unknown> | undefined;
    if (session) {
      const prompt = typeof session.prompt === "string" ? session.prompt : "";
      session.prompt = `${prompt} [[smoke-slow]]`.trim();
    }
    body = JSON.stringify(obj);
  }

  const signature = badSig
    ? "0".repeat(64)
    : createHmac("sha256", webhookSecret).update(body).digest("hex");

  const res = await fetch(`${baseUrl}/webhooks/linear/${slug}`, {
    method: "POST",
    headers: { "content-type": "application/json", "linear-signature": signature },
    body,
  });
  if (badSig) {
    if (res.status !== 401) {
      console.error(`[smoke] expected 401 with --bad-sig but got ${res.status}`);
      process.exit(1);
    }
    console.log("[smoke] bad signature correctly rejected with 401");
    process.exit(0);
  }
  const payload = (await res.json()) as { agentRunJobId?: string; status?: string };
  if (!payload.agentRunJobId) {
    console.error("[smoke] no agentRunJobId returned:", payload);
    process.exit(1);
  }
  const id = payload.agentRunJobId;
  console.log(`[smoke] agent_run_job ${id} ${payload.status}`);
  if (payload.status === "duplicate") {
    console.log("[smoke] duplicate delivery, no new job");
    process.exit(0);
  }

  const startedAt = Date.now();
  const TIMEOUT_MS = slow ? 60_000 : 30_000;
  let lastSeen = "";
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const r = await fetch(`${baseUrl}/api/agent-run-jobs/${id}`);
    const j = (await r.json()) as { job: { status: string }; events: { eventType: string }[] };
    const types = j.events.map((e) => e.eventType).join(" → ");
    if (types !== lastSeen) {
      console.log(`[smoke] runner_events: ${types}`);
      lastSeen = types;
    }
    if (["succeeded", "failed", "canceled"].includes(j.job.status)) {
      console.log(`[smoke] final status: ${j.job.status}`);
      process.exit(j.job.status === "succeeded" ? 0 : 2);
    }
    await new Promise((r) => setTimeout(r, slow ? 500 : 200));
  }
  console.error(`[smoke] timed out waiting for job ${id} to finish`);
  process.exit(1);
}

main().catch((e) => {
  console.error("[smoke] error:", (e as Error).message);
  process.exit(1);
});
