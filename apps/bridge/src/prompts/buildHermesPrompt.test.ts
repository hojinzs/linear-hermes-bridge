import { describe, expect, it } from "vitest";
import { buildHermesPrompt } from "./buildHermesPrompt.js";

describe("buildHermesPrompt", () => {
  const base = {
    agentDisplayName: "PM Agent",
    organizationId: "org_dev",
    triggerType: "agent_session_prompted" as const,
    issue: {
      identifier: "ENG-123",
      title: "Improve summary",
      url: "https://linear.app/x/ENG-123",
    },
    userInstruction: "Summarize and propose a plan. Do not create a PR yet.",
    permissionPolicy: {
      autoAllowed: ["summarize", "plan", "comment"],
      requiresApproval: ["code_change", "create_pr"],
      forbidden: ["merge", "deploy"],
      defaultMode: "plan-only",
    },
  };

  it("includes policy, context, instruction in distinct sections", () => {
    const prompt = buildHermesPrompt(base);
    expect(prompt).toContain("# Identity");
    expect(prompt).toContain("PM Agent");
    expect(prompt).toContain("# Policy");
    expect(prompt).toContain("plan-only");
    expect(prompt).toContain("# Linear context");
    expect(prompt).toContain("ENG-123");
    expect(prompt).toContain("# User instruction");
    expect(prompt).toContain("Summarize and propose a plan");
  });

  it("declares Linear content as untrusted user input", () => {
    const prompt = buildHermesPrompt(base);
    expect(prompt.toLowerCase()).toContain("untrusted");
  });

  it("renders forbidden actions explicitly", () => {
    const prompt = buildHermesPrompt(base);
    expect(prompt).toContain("merge");
    expect(prompt).toContain("deploy");
  });

  it("safely handles missing policy fields", () => {
    const prompt = buildHermesPrompt({ ...base, permissionPolicy: { defaultMode: "plan-only" } });
    expect(prompt).toContain("plan-only");
  });
});
