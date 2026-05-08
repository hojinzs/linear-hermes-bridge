import type { AppLogger } from "../logger.js";
import { LinearGraphqlClient } from "./client.js";
import { mockWriter } from "./mockWriter.js";
import type { LinearWriter, PostCommentInput, PostCommentResult } from "./writer.js";

export function linearWriter(deps: {
  logger: AppLogger;
  linearLive: boolean;
  getAccessToken: () => Promise<string>;
}): LinearWriter {
  if (!deps.linearLive) return mockWriter(deps.logger);

  return {
    async postComment(input: PostCommentInput): Promise<PostCommentResult> {
      try {
        const token = await deps.getAccessToken();
        const client = new LinearGraphqlClient(token);
        const r = await client.commentCreate({
          issueId: input.issueId,
          body: input.body,
          parentId: input.parentCommentId ?? null,
        });
        return { ok: true, commentId: r.id };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}
