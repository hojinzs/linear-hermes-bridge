export type PostCommentInput = {
  agentRunJobId: string;
  runAttemptId: string;
  organizationId: string;
  issueId: string;
  body: string;
  parentCommentId?: string | null;
};

export type PostCommentResult = { ok: true; commentId: string } | { ok: false; error: string };

export interface LinearWriter {
  postComment(input: PostCommentInput): Promise<PostCommentResult>;
}
