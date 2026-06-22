import { randomUUID } from "node:crypto";
import type { HermesConnector } from "./connector.js";
import type { HermesRunInput, HermesRunResult } from "./types.js";

// Dev/smoke-only: `pnpm smoke -- --slow` appends this marker to the user
// instruction so a single run is slow enough (5s) to exercise cancellation
// (Scenario G) without making every run of the mock agent slow.
export const SMOKE_SLOW_MARKER = "[[smoke-slow]]";

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

export function mockConnector(opts?: { slow?: boolean }): HermesConnector {
  const slow = opts?.slow ?? false;
  return {
    type: "mock",
    async ping() {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, latencyMs: Date.now() - start };
    },
    async run(input: HermesRunInput): Promise<HermesRunResult> {
      const runSlow = slow || input.userInstruction.includes(SMOKE_SLOW_MARKER);
      const ms = runSlow ? 5000 : 100 + Math.floor(Math.random() * 200);
      try {
        input.onProgress?.({ type: "heartbeat" });
        await delay(ms, input.signal);
        input.onProgress?.({ type: "progress", message: "mock work done" });
        const summary = `Mock Hermes acknowledged: ${input.userInstruction.slice(0, 80)}`;
        return {
          ok: true,
          output: { summary, events: [{ kind: "mock_event", at: new Date().toISOString() }] },
          hermesSessionKey: input.hermesSessionKey ?? `mock_${randomUUID()}`,
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}
