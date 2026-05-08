import { createHmac } from "node:crypto";
import { type Server, createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localWebhookConnector } from "./localWebhookConnector.js";

describe("localWebhookConnector", () => {
  let server: Server;
  let port: number;
  let receivedBody = "";
  let receivedSig = "";
  const respond: (req: { status: number; body: string }) => void = () => {};

  beforeEach(async () => {
    receivedBody = "";
    receivedSig = "";
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf8");
        receivedSig = (req.headers["x-webhook-signature"] as string) ?? "";
        respond({ status: 200, body: JSON.stringify({ ok: true, summary: "ack" }) });
        // Default behavior: respond 200
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, summary: "ack" }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("posts a signed body and returns ok with summary", async () => {
    const c = localWebhookConnector({
      url: `http://127.0.0.1:${port}/webhook`,
      hmacSecret: "shh",
      timeoutMs: 2000,
    });
    const ac = new AbortController();
    const r = await c.run({
      agentRunJobId: "arj_1",
      runAttemptId: "ra_1",
      agentId: "agt_1",
      prompt: "system\nuser",
      userInstruction: "user",
      hermesSessionKey: null,
      signal: ac.signal,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.summary).toBe("ack");
    const expected = createHmac("sha256", "shh").update(receivedBody).digest("hex");
    expect(receivedSig).toBe(expected);
  });

  it("times out and returns error", async () => {
    // Hijack: replace server close to delay forever — use a separate server
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const slow = createServer((_req, _res) => {
      // Never respond
    });
    await new Promise<void>((resolve) => slow.listen(0, "127.0.0.1", () => resolve()));
    const slowPort = (slow.address() as { port: number }).port;

    const c = localWebhookConnector({
      url: `http://127.0.0.1:${slowPort}/x`,
      hmacSecret: "shh",
      timeoutMs: 100,
    });
    const r = await c.run({
      agentRunJobId: "arj_1",
      runAttemptId: "ra_1",
      agentId: "agt_1",
      prompt: "p",
      userInstruction: "u",
      hermesSessionKey: null,
      signal: new AbortController().signal,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/timeout|abort/i);
    await new Promise<void>((resolve) => slow.close(() => resolve()));
  });
});
