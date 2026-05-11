import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../db/client.js";
import { prepareIssueWorkspace, sanitizeIssueSegment } from "./workspaceManager.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function setup() {
  const root = mkdtempSync(join(tmpdir(), "lhb-ws-"));
  const dbDir = mkdtempSync(join(tmpdir(), "lhb-ws-db-"));
  const { db, close } = createDb(`file:${join(dbDir, "t.db")}`);
  migrate(db, { migrationsFolder });
  return { root, dbDir, db, close };
}

describe("sanitizeIssueSegment", () => {
  it("preserves safe alphanumerics, dashes, and underscores", () => {
    expect(sanitizeIssueSegment("ENG-123_abc")).toBe("ENG-123_abc");
  });

  it("replaces unsafe characters with dashes", () => {
    expect(sanitizeIssueSegment("foo/bar baz")).toBe("foo-bar-baz");
  });

  it("strips path traversal sequences", () => {
    expect(sanitizeIssueSegment("../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeIssueSegment("..")).toBe("");
    expect(sanitizeIssueSegment("./..")).toBe("");
  });

  it("collapses repeated dashes and trims edges", () => {
    expect(sanitizeIssueSegment("--foo--bar--")).toBe("foo-bar");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeIssueSegment("")).toBe("");
  });
});

describe("prepareIssueWorkspace", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.close();
    rmSync(ctx.root, { recursive: true, force: true });
    rmSync(ctx.dbDir, { recursive: true, force: true });
  });

  it("creates a new workspace directory on first call and persists state", async () => {
    const result = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_1234567890", identifier: "HJ-123", title: "Test" },
    });

    expect(result.created).toBe(true);
    expect(result.workspacePath.startsWith(ctx.root)).toBe(true);
    expect(existsSync(result.workspacePath)).toBe(true);

    const rows = ctx.db.select().from(schema.agentWorkspaces).all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.workspacePath).toBe(result.workspacePath);
    expect(rows[0]?.linearIssueId).toBe("iss_1234567890");
    expect(rows[0]?.agentId).toBe("agt_1");
  });

  it("reuses the same workspace for a follow-up call on the same issue", async () => {
    const first = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_1234567890", identifier: "HJ-123", title: "Test" },
    });
    const second = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_1234567890", identifier: "HJ-123", title: "Test" },
    });

    expect(second.workspacePath).toBe(first.workspacePath);
    expect(second.created).toBe(false);

    const rows = ctx.db.select().from(schema.agentWorkspaces).all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.lastUsedAt >= rows[0]?.createdAt).toBe(true);
  });

  it("reuses the workspace even if the on-disk directory was removed between runs", async () => {
    const first = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_1234567890", identifier: "HJ-123", title: "Test" },
    });
    rmSync(first.workspacePath, { recursive: true, force: true });

    const second = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_1234567890", identifier: "HJ-123", title: "Test" },
    });

    expect(second.workspacePath).toBe(first.workspacePath);
    expect(existsSync(second.workspacePath)).toBe(true);
  });

  it("isolates different Linear issues into different workspaces", async () => {
    const a = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_aaaaaaaa", identifier: "HJ-100", title: "A" },
    });
    const b = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_bbbbbbbb", identifier: "HJ-101", title: "B" },
    });

    expect(a.workspacePath).not.toBe(b.workspacePath);
    expect(ctx.db.select().from(schema.agentWorkspaces).all().length).toBe(2);
  });

  it("rejects path traversal attempts via issue identifier", async () => {
    const result = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "daapp",
      agentId: "agt_1",
      organizationId: "org_abc",
      issue: { id: "iss_evil0000", identifier: "../../escape", title: "x" },
    });

    expect(result.workspacePath.startsWith(`${ctx.root}/`)).toBe(true);
    expect(result.workspacePath).not.toContain("..");
  });

  it("rejects path traversal in organizationId/agentSlug", async () => {
    const result = await prepareIssueWorkspace({
      db: ctx.db,
      workspaceRoot: ctx.root,
      agentSlug: "../bad",
      agentId: "agt_1",
      organizationId: "../../org",
      issue: { id: "iss_ok000000", identifier: "OK-1", title: "x" },
    });
    expect(result.workspacePath.startsWith(`${ctx.root}/`)).toBe(true);
    expect(result.workspacePath).not.toContain("..");
  });

  it("throws when sanitization yields an empty issue segment", async () => {
    await expect(
      prepareIssueWorkspace({
        db: ctx.db,
        workspaceRoot: ctx.root,
        agentSlug: "daapp",
        agentId: "agt_1",
        organizationId: "org_abc",
        issue: { id: "", identifier: "..", title: "" },
      }),
    ).rejects.toThrow(/invalid issue/i);
  });
});
