import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { enqueueAgentRunJob } from "./enqueue.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lhb-q-"));
  const { db, close } = createDb(`file:${join(dir, "t.db")}`);
  migrate(db, { migrationsFolder });
  return { db, close };
}

const trigger = {
  kind: "agent_session_prompted" as const,
  organizationId: "org_dev",
  agentSessionId: "sess1",
  issue: {
    id: "issue1",
    identifier: "ENG-1",
    title: "t",
    url: "https://linear.app/x/issue/ENG-1",
  },
  userInstruction: "do thing",
  deliveryId: "del-1",
  commentId: null,
};

describe("enqueueAgentRunJob", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("inserts a queued job and returns accepted on first enqueue", () => {
    const r = enqueueAgentRunJob({
      db: ctx.db,
      agentId: "agt-1",
      trigger,
      rawBody: '{"any":"body"}',
    });
    expect(r.status).toBe("accepted");
    expect(r.agentRunJobId).toMatch(/^arj_/);
  });

  it("is idempotent: same delivery id yields duplicate result", () => {
    const a = enqueueAgentRunJob({
      db: ctx.db,
      agentId: "agt-1",
      trigger,
      rawBody: '{"any":"body"}',
    });
    const b = enqueueAgentRunJob({
      db: ctx.db,
      agentId: "agt-1",
      trigger,
      rawBody: '{"any":"body"}',
    });
    expect(b.status).toBe("duplicate");
    expect(b.agentRunJobId).toBe(a.agentRunJobId);
  });

  it("falls back to session+prompt hash when deliveryId is null", () => {
    const t2 = { ...trigger, deliveryId: null };
    const a = enqueueAgentRunJob({ db: ctx.db, agentId: "agt-1", trigger: t2, rawBody: "x" });
    const b = enqueueAgentRunJob({ db: ctx.db, agentId: "agt-1", trigger: t2, rawBody: "x" });
    expect(b.status).toBe("duplicate");
    expect(a.agentRunJobId).toBe(b.agentRunJobId);
  });

  it("falls back to payload hash for triggers without session id", () => {
    const t2 = { ...trigger, deliveryId: null, kind: "mention" as const };
    (t2 as Partial<typeof t2>).agentSessionId = undefined;
    const a = enqueueAgentRunJob({
      db: ctx.db,
      agentId: "agt-1",
      trigger: t2 as never,
      rawBody: "x",
    });
    const b = enqueueAgentRunJob({
      db: ctx.db,
      agentId: "agt-1",
      trigger: t2 as never,
      rawBody: "x",
    });
    expect(b.status).toBe("duplicate");
    expect(a.agentRunJobId).toBe(b.agentRunJobId);
  });
});
