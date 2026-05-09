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

        // Agent Session path: try agentActivityCreate first (requires `write` scope)
        // so the Linear UI marks the session as "responded". If the OAuth token
        // doesn't have that scope we fall back to commentCreate; the body is still
        // visible in the issue thread, just without session-state transitions.
        let activityId: string | undefined;
        if (input.agentSessionId) {
          try {
            const activity = await client.agentActivityCreate({
              agentSessionId: input.agentSessionId,
              body: input.body,
              type: "response",
            });
            activityId = activity.id;
            deps.logger.info(
              {
                tag: "linear.agent_activity.posted",
                agentRunJobId: input.agentRunJobId,
                runAttemptId: input.runAttemptId,
                agentSessionId: input.agentSessionId,
                activityId,
              },
              "linear agent activity posted",
            );
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

        // Plain comment (always posted; serves as session reply when activity fails or
        // for mention/delegation triggers).
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
            ...(activityId && { activityId }),
          },
          "linear comment posted",
        );
        return {
          ok: true,
          commentId: r.id,
          ...(activityId && { activityId }),
        };
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
