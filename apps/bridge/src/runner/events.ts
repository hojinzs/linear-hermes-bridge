import { eq, max } from "drizzle-orm";
import { type DbClient, schema } from "../db/client.js";
import { newId } from "../services/ids.js";
import type { RunnerEventType } from "./types.js";

export function appendRunnerEvent(input: {
  db: DbClient;
  runAttemptId: string;
  agentRunJobId: string;
  agentSessionId: string | null;
  eventType: RunnerEventType;
  payload: unknown;
}): void {
  const lastSeq =
    input.db
      .select({ s: max(schema.runnerEvents.sequence) })
      .from(schema.runnerEvents)
      .where(eq(schema.runnerEvents.runAttemptId, input.runAttemptId))
      .get()?.s ?? 0;
  input.db
    .insert(schema.runnerEvents)
    .values({
      id: newId("rev"),
      runAttemptId: input.runAttemptId,
      agentRunJobId: input.agentRunJobId,
      agentSessionId: input.agentSessionId,
      eventType: input.eventType,
      sequence: (lastSeq ?? 0) + 1,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    })
    .run();
}
