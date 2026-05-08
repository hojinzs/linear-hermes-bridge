import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto/encryption.js";
import { type DbClient, schema } from "../db/client.js";
import { newId } from "./ids.js";

export type ConnectorType = "mock" | "localWebhook" | "apiServer" | "cli";

export type CreateAgentInput = {
  slug: string;
  displayName: string;
  description: string | null;
  iconUrl: string | null;
  linearClientId: string;
  linearClientSecret: string;
  linearWebhookSecret: string;
  requiredScopes: string[];
  hermesConnectorType: ConnectorType;
  hermesConnectorConfig: unknown;
  permissionPolicy: unknown;
  maxConcurrentRuns?: number;
};

export type AgentSummary = {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconUrl: string | null;
  enabled: boolean;
  hermesConnectorType: ConnectorType;
  createdAt: string;
  updatedAt: string;
};

export type AgentWithSecrets = AgentSummary & {
  linearClientId: string;
  linearClientSecret: string;
  linearWebhookSecret: string;
  hermesConnectorConfig: unknown;
  permissionPolicy: unknown;
  requiredScopes: string[];
  maxConcurrentRuns: number;
};

export interface AgentService {
  create(input: CreateAgentInput): Promise<AgentSummary>;
  listSummaries(): Promise<AgentSummary[]>;
  getBySlug(slug: string): Promise<AgentSummary | null>;
  getBySlugWithSecrets(slug: string): Promise<AgentWithSecrets | null>;
  setEnabled(slug: string, enabled: boolean): Promise<void>;
}

export function createAgentService(deps: { db: DbClient; encryptionKey: Buffer }): AgentService {
  const { db, encryptionKey } = deps;

  function summarize(row: typeof schema.agents.$inferSelect): AgentSummary {
    return {
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      description: row.description ?? null,
      iconUrl: row.iconUrl ?? null,
      enabled: row.enabled,
      hermesConnectorType: row.hermesConnectorType as ConnectorType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    async create(input) {
      const existing = db
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.slug, input.slug))
        .all();
      if (existing.length > 0) throw new Error(`agent slug already exists: ${input.slug}`);
      const now = new Date().toISOString();
      const row = {
        id: newId("agt"),
        slug: input.slug,
        displayName: input.displayName,
        description: input.description,
        iconUrl: input.iconUrl,
        enabled: true,
        linearClientId: input.linearClientId,
        linearClientSecretEnc: encrypt(input.linearClientSecret, encryptionKey),
        linearWebhookSecretEnc: encrypt(input.linearWebhookSecret, encryptionKey),
        requiredScopes: input.requiredScopes,
        hermesConnectorType: input.hermesConnectorType,
        hermesConnectorConfigEnc: encrypt(
          JSON.stringify(input.hermesConnectorConfig),
          encryptionKey,
        ),
        permissionPolicy: input.permissionPolicy,
        maxConcurrentRuns: input.maxConcurrentRuns ?? 1,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(schema.agents).values(row).run();
      return summarize(row as typeof schema.agents.$inferSelect);
    },

    async listSummaries() {
      const rows = db.select().from(schema.agents).all();
      return rows.map(summarize);
    },

    async getBySlug(slug) {
      const row = db.select().from(schema.agents).where(eq(schema.agents.slug, slug)).get();
      return row ? summarize(row) : null;
    },

    async getBySlugWithSecrets(slug) {
      const row = db.select().from(schema.agents).where(eq(schema.agents.slug, slug)).get();
      if (!row) return null;
      return {
        ...summarize(row),
        linearClientId: row.linearClientId,
        linearClientSecret: decrypt(row.linearClientSecretEnc, encryptionKey),
        linearWebhookSecret: decrypt(row.linearWebhookSecretEnc, encryptionKey),
        hermesConnectorConfig: JSON.parse(decrypt(row.hermesConnectorConfigEnc, encryptionKey)),
        permissionPolicy: row.permissionPolicy,
        requiredScopes: row.requiredScopes,
        maxConcurrentRuns: row.maxConcurrentRuns,
      };
    },

    async setEnabled(slug, enabled) {
      db.update(schema.agents)
        .set({ enabled, updatedAt: new Date().toISOString() })
        .where(eq(schema.agents.slug, slug))
        .run();
    },
  };
}
