import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { type DbClient, schema } from "../db/client.js";

export function runJobsRoutes(deps: { db: DbClient }) {
  const { db } = deps;
  const app = new Hono();

  app.get("/", (c) => {
    const agentSlug = c.req.query("agentSlug");
    const status = c.req.query("status");
    const conditions: Parameters<typeof and>[number][] = [];
    if (agentSlug) {
      const ag = db.select().from(schema.agents).where(eq(schema.agents.slug, agentSlug)).get();
      if (!ag) return c.json({ jobs: [] });
      conditions.push(eq(schema.agentRunJobs.agentId, ag.id));
    }
    if (status) conditions.push(eq(schema.agentRunJobs.status, status));
    const baseQuery = db.select().from(schema.agentRunJobs).$dynamic();
    const filteredQuery = conditions.length === 0 ? baseQuery : baseQuery.where(and(...conditions));
    const rows = filteredQuery.orderBy(desc(schema.agentRunJobs.createdAt)).limit(100).all();
    return c.json({ jobs: rows });
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const job = db.select().from(schema.agentRunJobs).where(eq(schema.agentRunJobs.id, id)).get();
    if (!job) return c.json({ error: "not_found" }, 404);
    const events = db
      .select()
      .from(schema.runnerEvents)
      .where(eq(schema.runnerEvents.agentRunJobId, id))
      .orderBy(asc(schema.runnerEvents.sequence))
      .all();
    const attempts = db
      .select()
      .from(schema.runAttempts)
      .where(eq(schema.runAttempts.agentRunJobId, id))
      .orderBy(asc(schema.runAttempts.attemptNumber))
      .all();
    return c.json({ job, events, attempts });
  });

  app.post("/:id/cancel", (c) => {
    const id = c.req.param("id");
    const job = db.select().from(schema.agentRunJobs).where(eq(schema.agentRunJobs.id, id)).get();
    if (!job) return c.json({ error: "not_found" }, 404);
    if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
      return c.json({ error: "terminal", status: job.status }, 409);
    }
    const now = new Date().toISOString();
    db.update(schema.agentRunJobs)
      .set({ cancelRequestedAt: now, updatedAt: now })
      .where(eq(schema.agentRunJobs.id, id))
      .run();
    return c.json({ ok: true, agentRunJobId: id, status: job.status, cancelRequestedAt: now }, 202);
  });

  return app;
}
