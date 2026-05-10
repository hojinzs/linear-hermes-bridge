import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeLinearEvent } from "./normalizeEvent.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");
const load = (name: string) =>
  JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as Record<string, unknown>;

describe("normalizeLinearEvent", () => {
  it("normalizes agent_session_prompted", () => {
    const ev = normalizeLinearEvent(load("agent-session-prompted.json"));
    expect(ev?.kind).toBe("agent_session_prompted");
    if (ev?.kind !== "agent_session_prompted") throw new Error();
    expect(ev.organizationId).toBe("org_dev");
    expect(ev.agentSessionId).toBe("agt_session_001");
    expect(ev.issue.identifier).toBe("ENG-123");
    expect(ev.userInstruction).toContain("summarize");
    expect(ev.deliveryId).toBe("del_prompted_001");
  });

  it("normalizes agent_session_created", () => {
    const ev = normalizeLinearEvent(load("agent-session-created.json"));
    expect(ev?.kind).toBe("agent_session_created");
  });

  it("normalizes app mention", () => {
    const ev = normalizeLinearEvent(load("app-mention.json"));
    expect(ev?.kind).toBe("mention");
    if (ev?.kind !== "mention") throw new Error();
    expect(ev.userInstruction).toContain("summarize");
  });

  it("returns null for unsupported event type", () => {
    expect(normalizeLinearEvent({ type: "Unknown", action: "x", organizationId: "o" })).toBeNull();
  });
});
