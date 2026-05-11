import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { type DbClient, schema } from "../db/client.js";
import { newId } from "../services/ids.js";
import type { PrepareWorkspaceResult } from "./types.js";

const SEGMENT_REGEX = /[^A-Za-z0-9_-]+/g;

export function sanitizeIssueSegment(raw: string): string {
  if (!raw) return "";
  // Dots are excluded from the allowed set so `..` can never appear in a segment.
  const replaced = raw.replace(SEGMENT_REGEX, "-");
  // Collapse repeated dashes and trim edges.
  return replaced.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function shortId(issueId: string): string {
  // Use first 8 hex/url-safe chars of the Linear issue id for a stable suffix.
  const cleaned = issueId.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.slice(0, 8);
}

function expandRoot(workspaceRoot: string): string {
  let root = workspaceRoot;
  if (root === "~" || root.startsWith(`~${sep}`) || root.startsWith("~/")) {
    root = root === "~" ? homedir() : `${homedir()}${root.slice(1)}`;
  }
  return resolve(root);
}

function joinUnderRoot(root: string, ...segments: string[]): string {
  const normalizedRoot = expandRoot(root);
  const candidate = resolve(normalizedRoot, ...segments);
  const rel = relative(normalizedRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("workspace path escapes workspaceRoot");
  }
  return candidate;
}

function computeIssueWorkspacePath(input: {
  workspaceRoot: string;
  agentSlug: string;
  organizationId: string;
  issue: { id: string; identifier: string };
}): string {
  const agent = sanitizeIssueSegment(input.agentSlug) || "agent";
  const org = sanitizeIssueSegment(input.organizationId) || "org";
  const identifier = sanitizeIssueSegment(input.issue.identifier);
  const suffix = shortId(input.issue.id);
  if (!identifier && !suffix) {
    throw new Error("invalid issue: identifier and id both empty after sanitization");
  }
  const issueSegment = identifier && suffix ? `${identifier}-${suffix}` : identifier || suffix;
  return joinUnderRoot(input.workspaceRoot, agent, org, issueSegment);
}

export async function prepareIssueWorkspace(input: {
  db: DbClient;
  workspaceRoot: string;
  agentSlug: string;
  agentId: string;
  organizationId: string;
  issue: { id: string; identifier: string; title: string };
}): Promise<PrepareWorkspaceResult> {
  const workspacePath = computeIssueWorkspacePath(input);
  const now = new Date().toISOString();

  const existing = input.db
    .select()
    .from(schema.agentWorkspaces)
    .where(
      and(
        eq(schema.agentWorkspaces.agentId, input.agentId),
        eq(schema.agentWorkspaces.linearOrganizationId, input.organizationId),
        eq(schema.agentWorkspaces.linearIssueId, input.issue.id),
      ),
    )
    .get();

  if (existing) {
    if (!existsSync(existing.workspacePath)) {
      mkdirSync(existing.workspacePath, { recursive: true });
    }
    input.db
      .update(schema.agentWorkspaces)
      .set({ lastUsedAt: now })
      .where(eq(schema.agentWorkspaces.id, existing.id))
      .run();
    return { workspacePath: existing.workspacePath, created: false };
  }

  mkdirSync(workspacePath, { recursive: true });
  input.db
    .insert(schema.agentWorkspaces)
    .values({
      id: newId("ws"),
      agentId: input.agentId,
      linearOrganizationId: input.organizationId,
      linearIssueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      workspacePath,
      status: "active",
      createdAt: now,
      lastUsedAt: now,
    })
    .run();
  return { workspacePath, created: true };
}
