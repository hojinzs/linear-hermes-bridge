import type { HermesRunInput, HermesRunResult } from "./types.js";

export interface HermesConnector {
  readonly type: string;
  run(input: HermesRunInput): Promise<HermesRunResult>;
  ping?(): Promise<{ ok: boolean; latencyMs: number }>;
}
