// Stub GraphQL client. Real Linear SDK / fetch calls live here in the next session.
// In this slice the wrapper exists so types compile; nothing calls it.
export type LinearAccessToken = string;

export class LinearGraphqlClient {
  constructor(
    private readonly _accessToken: LinearAccessToken,
    private readonly _endpoint = "https://api.linear.app/graphql",
  ) {}

  async commentCreate(_input: {
    issueId: string;
    body: string;
    parentId?: string | null;
  }): Promise<{ id: string }> {
    throw new Error(
      "LinearGraphqlClient.commentCreate is a stub in the MVP slice; real impl pending",
    );
  }
}
