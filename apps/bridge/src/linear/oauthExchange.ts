export class LinearOauthExchangeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LinearOauthExchangeError";
  }
}

export type LinearTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
};

const TOKEN_URL = "https://api.linear.app/oauth/token";

export async function exchangeLinearCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<LinearTokenResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinearOauthExchangeError(
      `linear token endpoint http ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }
  const json = (await res.json()) as Partial<LinearTokenResponse>;
  if (!json.access_token || typeof json.access_token !== "string") {
    throw new LinearOauthExchangeError("token response missing access_token");
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type ?? "Bearer",
    expires_in: json.expires_in,
    scope: json.scope,
  };
}
