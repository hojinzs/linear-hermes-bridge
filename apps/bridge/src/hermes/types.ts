export type HermesProgressEvent = {
  type: "heartbeat" | "progress";
  message?: string;
  payload?: unknown;
};

export type HermesRunInput = {
  agentRunJobId: string;
  runAttemptId: string;
  agentId: string;
  prompt: string;
  userInstruction: string;
  hermesSessionKey: string | null;
  signal: AbortSignal;
  onProgress?: (ev: HermesProgressEvent) => void;
};

export type HermesRunResult =
  | {
      ok: true;
      asyncAccepted?: boolean;
      output: { summary: string; events?: unknown[] };
      hermesSessionKey: string;
    }
  | {
      ok: false;
      error: string;
      hermesSessionKey?: string;
    };
