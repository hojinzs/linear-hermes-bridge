import type { LinearIssueRef, NormalizedTrigger } from "./types.js";

type Json = Record<string, unknown> | undefined | null;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function readIssue(v: unknown): LinearIssueRef | null {
  const o = asObj(v);
  if (!o) return null;
  if (
    typeof o.id === "string" &&
    typeof o.identifier === "string" &&
    typeof o.title === "string" &&
    typeof o.url === "string"
  ) {
    return { id: o.id, identifier: o.identifier, title: o.title, url: o.url };
  }
  return null;
}

export function normalizeLinearEvent(payload: unknown): NormalizedTrigger | null {
  const root = asObj(payload);
  if (!root) return null;
  const type = root.type;
  const action = root.action;
  const orgId = root.organizationId;
  const deliveryId =
    typeof root.deliveryId === "string" && root.deliveryId.length > 0 ? root.deliveryId : null;
  if (typeof orgId !== "string") return null;

  if (type === "AgentSessionEvent") {
    const session = asObj(root.agentSession);
    if (!session) return null;
    const issue = readIssue(session.issue);
    if (!issue) return null;
    const sessionId = typeof session.id === "string" ? session.id : null;
    if (!sessionId) return null;
    const commentId =
      asObj(session.comment) && typeof asObj(session.comment)?.id === "string"
        ? (asObj(session.comment)?.id as string)
        : null;
    const prompt = typeof session.prompt === "string" ? session.prompt : "";

    if (action === "created") {
      return {
        kind: "agent_session_created",
        organizationId: orgId,
        agentSessionId: sessionId,
        issue,
        userInstruction: prompt,
        deliveryId,
        commentId,
      };
    }
    if (action === "prompted") {
      return {
        kind: "agent_session_prompted",
        organizationId: orgId,
        agentSessionId: sessionId,
        issue,
        userInstruction: prompt,
        deliveryId,
        commentId,
      };
    }
    return null;
  }

  if (type === "AppUserNotification") {
    const notif = asObj(root.notification);
    if (!notif) return null;
    const issue = readIssue(notif.issue);
    if (!issue) return null;
    const comment = asObj(notif.comment);
    const commentId = comment && typeof comment.id === "string" ? comment.id : null;
    const body = comment && typeof comment.body === "string" ? comment.body : "";
    if (action === "issueMention") {
      return {
        kind: "mention",
        organizationId: orgId,
        issue,
        userInstruction: body,
        deliveryId,
        commentId,
      };
    }
    if (action === "issueAssignedToYou" || action === "issueDelegated") {
      return {
        kind: "delegation",
        organizationId: orgId,
        issue,
        userInstruction: body,
        deliveryId,
        commentId,
      };
    }
  }
  return null;
}
