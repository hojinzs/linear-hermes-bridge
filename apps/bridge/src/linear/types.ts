export type LinearIssueRef = {
  id: string;
  identifier: string;
  title: string;
  url: string;
};

export type NormalizedTrigger =
  | {
      kind: "agent_session_created";
      organizationId: string;
      agentSessionId: string;
      issue: LinearIssueRef;
      userInstruction: string;
      deliveryId: string | null;
      commentId: string | null;
    }
  | {
      kind: "agent_session_prompted";
      organizationId: string;
      agentSessionId: string;
      issue: LinearIssueRef;
      userInstruction: string;
      deliveryId: string | null;
      commentId: string | null;
    }
  | {
      kind: "mention";
      organizationId: string;
      issue: LinearIssueRef;
      userInstruction: string;
      deliveryId: string | null;
      commentId: string | null;
    }
  | {
      kind: "delegation";
      organizationId: string;
      issue: LinearIssueRef;
      userInstruction: string;
      deliveryId: string | null;
      commentId: string | null;
    };
