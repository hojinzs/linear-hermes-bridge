import { describe, expect, it } from "vitest";
import { cliConnector } from "./cliConnector.js";
import type { HermesRunInput } from "./types.js";

const NODE = process.execPath;

function makeInput(overrides: Partial<HermesRunInput> = {}): HermesRunInput {
  return {
    agentRunJobId: "arj_test",
    runAttemptId: "ra_test",
    agentId: "agt_test",
    prompt: "system policy\n\nuser context\n\ninstruction",
    userInstruction: "instruction",
    hermesSessionKey: null,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("cliConnector", () => {
  it("captures stdout as summary when child exits 0 (text mode)", async () => {
    const c = cliConnector({
      command: NODE,
      args: [
        "-e",
        "process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write('hello from child'); });",
      ],
      timeoutMs: 5000,
    });
    const r = await c.run(makeInput());
    if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
    expect(r.output.summary).toBe("hello from child");
    expect(r.hermesSessionKey).toBeTruthy();
  });

  it("pipes prompt to child stdin", async () => {
    const c = cliConnector({
      command: NODE,
      args: [
        "-e",
        // Echo stdin back to stdout
        "let b=''; process.stdin.on('data', d => b+=d); process.stdin.on('end', () => process.stdout.write(b));",
      ],
      timeoutMs: 5000,
    });
    const r = await c.run(makeInput({ prompt: "PROMPT_MARKER_42" }));
    if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
    expect(r.output.summary).toContain("PROMPT_MARKER_42");
  });

  it("returns error when child exits non-zero, including stderr tail", async () => {
    const c = cliConnector({
      command: NODE,
      args: ["-e", "process.stderr.write('boom-stderr'); process.exit(7);"],
      timeoutMs: 5000,
    });
    const r = await c.run(makeInput());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/exit/i);
    expect(r.error).toMatch(/7/);
    expect(r.error).toMatch(/boom-stderr/);
  });

  it("returns error on spawn ENOENT", async () => {
    const c = cliConnector({
      command: "this-binary-should-not-exist-xyz-1234",
      args: [],
      timeoutMs: 2000,
    });
    const r = await c.run(makeInput());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/spawn|ENOENT|not found/i);
  });

  it("kills child and returns timeout error when timeoutMs elapses", async () => {
    const c = cliConnector({
      command: NODE,
      args: ["-e", "setInterval(() => {}, 1000);"],
      timeoutMs: 150,
    });
    const start = Date.now();
    const r = await c.run(makeInput());
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/timeout|abort|kill/i);
    expect(elapsed).toBeLessThan(3000);
  });

  it("aborts child when input.signal aborts", async () => {
    const ac = new AbortController();
    const c = cliConnector({
      command: NODE,
      args: ["-e", "setInterval(() => {}, 1000);"],
      timeoutMs: 10000,
    });
    const p = c.run(makeInput({ signal: ac.signal }));
    setTimeout(() => ac.abort(), 80);
    const r = await p;
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/abort|cancel|kill|timeout/i);
  });

  it("parses summary from JSON when outputFormat=json", async () => {
    const payload = JSON.stringify({ summary: "json summary", events: [{ k: 1 }] });
    const c = cliConnector({
      command: NODE,
      args: [
        "-e",
        `process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(${JSON.stringify(payload)}));`,
      ],
      timeoutMs: 5000,
      outputFormat: "json",
    });
    const r = await c.run(makeInput());
    if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
    expect(r.output.summary).toBe("json summary");
    expect(r.output.events).toEqual([{ k: 1 }]);
  });

  it("passes additional env vars to child", async () => {
    const c = cliConnector({
      command: NODE,
      args: [
        "-e",
        "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(process.env.LHB_TEST_MARKER || 'missing'));",
      ],
      timeoutMs: 5000,
      env: { LHB_TEST_MARKER: "marker-value-99" },
    });
    const r = await c.run(makeInput());
    if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
    expect(r.output.summary).toBe("marker-value-99");
  });

  it("rejects invalid config (missing command)", () => {
    expect(() => cliConnector({})).toThrow(/command/i);
    expect(() => cliConnector({ command: "" })).toThrow(/command/i);
  });
});
