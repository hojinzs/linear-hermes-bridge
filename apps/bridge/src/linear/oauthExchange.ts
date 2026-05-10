export class LinearOauthExchangeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorCode?: string,
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

function parseOauthErrorCode(text: string): string | undefined {
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

async function readErrorBody(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

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
    const text = await readErrorBody(res);
    throw new LinearOauthExchangeError(
      `linear token endpoint http ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      parseOauthErrorCode(text),
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

export async function exchangeRefreshLinearToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<LinearTokenResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await readErrorBody(res);
    throw new LinearOauthExchangeError(
      `linear token endpoint http ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      parseOauthErrorCode(text),
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
