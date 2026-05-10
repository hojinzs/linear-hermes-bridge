import type { LinearIssueRef, NormalizedTrigger } from "./types.js";

type Json = Record<string, unknown> | undefined | null;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pickStringField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
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
  // Linear webhook delivery uniqueness isn't well-documented — what's stable across
  // versions is:
  //   - `deliveryId`  (older fixtures only)
  //   - `webhookTimestamp`  (unix ms; unique per delivery; the same webhook fires
  //                          twice with two timestamps for two events)
  //   - `agentActivity.id` (UUID; unique per agent_session_prompted event)
  // `webhookId` alone is NOT unique — it's the subscription's id, shared across deliveries.
  // We compose: deliveryId ?? agentActivity.id ?? `${webhookId}:${webhookTimestamp}` ?? id
  const fixturedeliveryId = pickStringField(root, "deliveryId");
  const activityForKey = asObj(root.agentActivity);
  const activityId =
    activityForKey && typeof activityForKey.id === "string" ? activityForKey.id : null;
  const wHookTs =
    typeof root.webhookTimestamp === "number" || typeof root.webhookTimestamp === "string"
      ? String(root.webhookTimestamp)
      : null;
  const wHookId = pickStringField(root, "webhookId");
  const composedDeliveryId =
    fixturedeliveryId ??
    activityId ??
    (wHookId && wHookTs ? `${wHookId}:${wHookTs}` : null) ??
    pickStringField(root, "id");
  const deliveryId = composedDeliveryId;
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

    // Linear puts the user's text in different places depending on the action and
    // payload version. Try, in priority order:
    //   1. root.agentActivity.content.body  (real "prompted" payloads)
    //   2. agentSession.comment.body        (real "created" from top-level mention)
    //   3. agentSession.prompt              (older fixture shape)
    //   4. agentSession.summary             (occasionally used for created)
    //   5. issue.description                (last-resort context for fresh delegations)
    const activity = asObj(root.agentActivity);
    const activityContent = activity ? asObj(activity.content) : null;
    const activityBody =
      activityContent && typeof activityContent.body === "string" ? activityContent.body : null;
    const sessionComment = asObj(session.comment);
    const sessionCommentBody =
      sessionComment && typeof sessionComment.body === "string" ? sessionComment.body : null;
    const sessionPrompt = typeof session.prompt === "string" ? session.prompt : null;
    const sessionSummary = typeof session.summary === "string" ? session.summary : null;
    const issueObj = asObj(session.issue);
    const issueDescription =
      issueObj && typeof issueObj.description === "string" ? issueObj.description : null;
    const prompt =
      activityBody ??
      sessionCommentBody ??
      sessionPrompt ??
      sessionSummary ??
      issueDescription ??
      "";

    // The user's actual mention comment id has different homes per action:
    //   - action=prompted (in-thread):       agentActivity.sourceCommentId
    //   - action=created (top-level mention): session.commentId IS the mention
    //                                          (no thread root yet)
    //   - fallback:                           session.sourceCommentId
    // For action=prompted, session.commentId is the SESSION THREAD ROOT — not the
    // mention — so we must NOT use it as sourceCommentId. The activity must take
    // precedence.
    const sourceCommentId =
      activity && typeof activity.sourceCommentId === "string"
        ? activity.sourceCommentId
        : typeof session.sourceCommentId === "string"
          ? session.sourceCommentId
          : action === "created" && typeof session.commentId === "string"
            ? session.commentId
            : null;

    if (action === "created") {
      return {
        kind: "agent_session_created",
        organizationId: orgId,
        agentSessionId: sessionId,
        issue,
        userInstruction: prompt,
        deliveryId,
        commentId,
        sourceCommentId,
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
        sourceCommentId,
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
    if (action === "issueMention" || action === "issueCommentMention") {
      return {
        kind: "mention",
        organizationId: orgId,
        issue,
        userInstruction: body,
        deliveryId,
        commentId,
        sourceCommentId: commentId,
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
        sourceCommentId: commentId,
      };
    }
  }
  return null;
}
