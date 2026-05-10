export type OrchestratorConfig = {
  pollIntervalMs: number;
  heartbeatTimeoutMs: number;
  claimLeaseMs: number;
  attemptTimeoutMs: number;
  retryBackoffMinMs: number;
  retryBackoffMaxMs: number;
};

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  pollIntervalMs: 250,
  heartbeatTimeoutMs: 60_000,
  claimLeaseMs: 30_000,
  attemptTimeoutMs: 120_000,
  retryBackoffMinMs: 15_000,
  retryBackoffMaxMs: 600_000,
};
