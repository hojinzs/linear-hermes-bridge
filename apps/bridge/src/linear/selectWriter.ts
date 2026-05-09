import { eq } from "drizzle-orm";
import { decrypt } from "../crypto/encryption.js";
import { type DbClient, schema } from "../db/client.js";
import type { AppLogger } from "../logger.js";
import { linearWriter } from "./linearWriter.js";
import { mockWriter } from "./mockWriter.js";
import type { LinearWriter } from "./writer.js";

export type SelectWriterInput = {
  db: DbClient;
  logger: AppLogger;
  agentId: string;
  encryptionKey: Buffer;
  linearLive: boolean;
  fetchImpl?: typeof fetch;
};

export class WriterMissingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterMissingTokenError";
  }
}

export function selectWriter(input: SelectWriterInput): LinearWriter {
  if (!input.linearLive) {
    return mockWriter(input.logger);
  }
  return linearWriter({
    logger: input.logger,
    linearLive: true,
    ...(input.fetchImpl && { fetchImpl: input.fetchImpl }),
    getAccessToken: async ({ organizationId }) => {
      const match = input.db
        .select()
        .from(schema.linearInstallations)
        .where(eq(schema.linearInstallations.agentId, input.agentId))
        .all()
        .find((row) => row.linearOrganizationId === organizationId);
      if (!match) {
        throw new WriterMissingTokenError(
          `no linear installation for agent ${input.agentId} org ${organizationId}`,
        );
      }
      if (match.status !== "installed") {
        throw new WriterMissingTokenError(
          `installation ${match.id} status=${match.status}, expected installed`,
        );
      }
      return decrypt(match.accessTokenEnc, input.encryptionKey);
    },
  });
}
