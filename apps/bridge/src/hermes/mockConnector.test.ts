import { describe, expect, it } from "vitest";
import { mockConnector } from "./mockConnector.js";

const baseInput = {
  agentRunJobId: "arj_1",
  runAttemptId: "ra_1",
  agentId: "agt_1",
  prompt: "system policy + user instruction",
  userInstruction: "Summarize this issue and propose a plan",
  hermesSessionKey: null,
  signal: new AbortController().signal,
};

describe("mockConnector", () => {
  it("returns ok with deterministic-ish summary based on input", async () => {
    const c = mockConnector({ slow: false });
    const r = await c.run(baseInput);
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.summary.startsWith("Mock Hermes acknowledged:")).toBe(true);
    expect(r.output.summary).toContain("Summarize");
    expect(r.hermesSessionKey).toMatch(/^mock_/);
  });

  it("ping returns ok quickly", async () => {
    const c = mockConnector({ slow: false });
    const r = await c.ping?.();
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("emits at least one heartbeat via onProgress", async () => {
    const events: string[] = [];
    const c = mockConnector({ slow: false });
    await c.run({ ...baseInput, onProgress: (e) => events.push(e.type) });
    expect(events).toContain("heartbeat");
  });

  it("aborts when signal is fired in slow mode", async () => {
    const ac = new AbortController();
    const c = mockConnector({ slow: true });
    const promise = c.run({ ...baseInput, signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    const r = await promise;
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error).toMatch(/abort/i);
  });
});
