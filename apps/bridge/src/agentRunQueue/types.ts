import type { NormalizedTrigger } from "../linear/types.js";

export type AgentRunJobInput = {
  agentId: string;
  trigger: NormalizedTrigger;
  rawBody: string;
};

export type EnqueueResult =
  | { status: "accepted"; agentRunJobId: string }
  | { status: "duplicate"; agentRunJobId: string };
