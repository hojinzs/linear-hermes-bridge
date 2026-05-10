import { randomUUID } from "node:crypto";
import type { AppLogger } from "../logger.js";
import type { LinearWriter, PostCommentInput, PostCommentResult } from "./writer.js";

export function mockWriter(logger: AppLogger): LinearWriter {
  return {
    async postComment(input: PostCommentInput): Promise<PostCommentResult> {
      const commentId = `mock_cmt_${randomUUID()}`;
      logger.info(
        {
          tag: "mock.linear.comment",
          agentRunJobId: input.agentRunJobId,
          runAttemptId: input.runAttemptId,
          organizationId: input.organizationId,
          issueId: input.issueId,
          parentCommentId: input.parentCommentId ?? null,
          body: input.body,
        },
        "mock linear comment posted",
      );
      return { ok: true, commentId };
    },
  };
}
