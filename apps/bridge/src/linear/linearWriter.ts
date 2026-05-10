import type { AppLogger } from "../logger.js";
import { LinearGraphqlClient } from "./client.js";
import { mockWriter } from "./mockWriter.js";
import type { LinearWriter, PostCommentInput, PostCommentResult } from "./writer.js";

export type GetAccessTokenContext = { organizationId: string };

export function linearWriter(deps: {
  logger: AppLogger;
  linearLive: boolean;
  getAccessToken: (ctx: GetAccessTokenContext) => Promise<string>;
  fetchImpl?: typeof fetch;
}): LinearWriter {
  if (!deps.linearLive) return mockWriter(deps.logger);

  return {
    async postComment(input: PostCommentInput): Promise<PostCommentResult> {
      try {
        const token = await deps.getAccessToken({ organizationId: input.organizationId });
        const client = new LinearGraphqlClient(token, undefined, deps.fetchImpl);

        // Agent Session path: agentActivityCreate (with type=response) marks the
        // session as "responded" AND creates a visible comment in the issue thread
        // automatically — so do NOT also call commentCreate when this succeeds.
        // If it fails (e.g., missing `write` scope), fall through to commentCreate
        // as a fallback.
        if (input.agentSessionId) {
          try {
            const activity = await client.agentActivityCreate({
              agentSessionId: input.agentSessionId,
              body: input.body,
              type: "response",
            });
            deps.logger.info(
              {
                tag: "linear.agent_activity.posted",
                agentRunJobId: input.agentRunJobId,
                runAttemptId: input.runAttemptId,
                agentSessionId: input.agentSessionId,
                activityId: activity.id,
              },
              "linear agent activity posted",
            );
            return { ok: true, commentId: activity.id, activityId: activity.id };
          } catch (activityError) {
            deps.logger.warn(
              {
                tag: "linear.agent_activity.failed",
                agentRunJobId: input.agentRunJobId,
                runAttemptId: input.runAttemptId,
                agentSessionId: input.agentSessionId,
                err: (activityError as Error).message,
              },
              "agent activity failed; falling back to comment",
            );
          }
        }

        // Fallback / mention / delegation path: regular comment.
        const r = await client.commentCreate({
          issueId: input.issueId,
          body: input.body,
          parentId: input.parentCommentId ?? null,
        });
        deps.logger.info(
          {
            tag: "linear.comment.posted",
            agentRunJobId: input.agentRunJobId,
            runAttemptId: input.runAttemptId,
            organizationId: input.organizationId,
            issueId: input.issueId,
            commentId: r.id,
            url: r.url,
          },
          "linear comment posted",
        );
        return { ok: true, commentId: r.id };
      } catch (e) {
        deps.logger.warn(
          {
            tag: "linear.comment.failed",
            agentRunJobId: input.agentRunJobId,
            runAttemptId: input.runAttemptId,
            organizationId: input.organizationId,
            issueId: input.issueId,
            err: (e as Error).message,
          },
          "linear comment failed",
        );
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}
