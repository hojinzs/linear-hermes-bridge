export type LinearAccessToken = string;

const DEFAULT_ENDPOINT = "https://api.linear.app/graphql";

export class LinearGraphqlError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "LinearGraphqlError";
  }
}

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: unknown }>;
};

export class LinearGraphqlClient {
  constructor(
    private readonly accessToken: LinearAccessToken,
    private readonly endpoint = DEFAULT_ENDPOINT,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async exec<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: this.accessToken.startsWith("Bearer ")
          ? this.accessToken
          : `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LinearGraphqlError(`linear http ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    const json = (await res.json()) as GraphqlResponse<T>;
    if (json.errors && json.errors.length > 0) {
      throw new LinearGraphqlError(
        `linear graphql errors: ${json.errors.map((e) => e.message).join("; ")}`,
        undefined,
        json.errors,
      );
    }
    if (!json.data) {
      throw new LinearGraphqlError("linear response had no data");
    }
    return json.data;
  }

  async viewer(): Promise<{
    id: string;
    name: string;
    organization: { id: string; name: string; urlKey: string };
  }> {
    const data = await this.exec<{
      viewer: {
        id: string;
        name: string;
        organization: { id: string; name: string; urlKey: string };
      };
    }>(`query Viewer {
      viewer { id name organization { id name urlKey } }
    }`);
    return data.viewer;
  }

  async commentCreate(input: {
    issueId: string;
    body: string;
    parentId?: string | null;
  }): Promise<{ id: string; url: string }> {
    const data = await this.exec<{
      commentCreate: { success: boolean; comment: { id: string; url: string } };
    }>(
      `mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) { success comment { id url } }
      }`,
      {
        input: {
          issueId: input.issueId,
          body: input.body,
          ...(input.parentId ? { parentId: input.parentId } : {}),
        },
      },
    );
    if (!data.commentCreate.success) {
      throw new LinearGraphqlError("commentCreate returned success=false");
    }
    return data.commentCreate.comment;
  }

  /**
   * Create an agent activity in a Linear Agent Session.
   *
   * Use this instead of commentCreate when the trigger originated from an agent_session_*
   * webhook. Linear's Agent Session UI tracks agent state via these activities; a plain
   * comment alone leaves the session marked as "did not respond".
   *
   * Content payload reference:
   *   https://linear.app/developers/agent-interaction#activity-content-payload
   *
   * Type "response" with `body` is the standard "agent finished" activity.
   */
  async agentActivityCreate(input: {
    agentSessionId: string;
    body: string;
    type?: "response" | "thought" | "action" | "elicitation" | "error";
    ephemeral?: boolean;
  }): Promise<{ id: string }> {
    const data = await this.exec<{
      agentActivityCreate: { success: boolean; agentActivity: { id: string } };
    }>(
      `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
        agentActivityCreate(input: $input) { success agentActivity { id } }
      }`,
      {
        input: {
          agentSessionId: input.agentSessionId,
          content: { type: input.type ?? "response", body: input.body },
          ...(input.ephemeral !== undefined && { ephemeral: input.ephemeral }),
        },
      },
    );
    if (!data.agentActivityCreate.success) {
      throw new LinearGraphqlError("agentActivityCreate returned success=false");
    }
    return data.agentActivityCreate.agentActivity;
  }
}
