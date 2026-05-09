export type PostCommentInput = {
  agentRunJobId: string;
  runAttemptId: string;
  organizationId: string;
  issueId: string;
  body: string;
  parentCommentId?: string | null;
  /**
   * When the trigger came from an agent_session_* webhook, pass the Linear
   * agentSession id here. The writer will use `agentActivityCreate` so the
   * Linear Agent Session UI correctly transitions from "thinking" to "responded".
   * If undefined, the writer falls back to a regular `commentCreate`.
   */
  agentSessionId?: string | null;
};

export type PostCommentResult =
  | { ok: true; commentId: string; activityId?: string }
  | { ok: false; error: string };

export interface LinearWriter {
  postComment(input: PostCommentInput): Promise<PostCommentResult>;
}
