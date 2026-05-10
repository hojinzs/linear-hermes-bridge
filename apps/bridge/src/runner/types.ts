export type RunnerEventType =
  | "claimed"
  | "context_loaded"
  | "prompt_built"
  | "hermes_started"
  | "progress"
  | "approval_required"
  | "linear_response_posted"
  | "completed"
  | "failed"
  | "canceled"
  | "timed_out"
  | "retry_scheduled";

export type RunnerOutcome = {
  status: "succeeded" | "failed" | "canceled" | "timed_out" | "awaiting_input";
  error?: string;
  hermesSessionKey?: string;
  output?: unknown;
};
