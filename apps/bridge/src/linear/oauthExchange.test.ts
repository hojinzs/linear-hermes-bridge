import { describe, expect, it } from "vitest";
import { LinearOauthExchangeError, exchangeLinearCode } from "./oauthExchange.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as typeof fetch;
}

describe("exchangeLinearCode", () => {
  const base = {
    clientId: "client",
    clientSecret: "secret",
    code: "code",
    redirectUri: "https://example/redirect",
  };

  it("returns parsed token response", async () => {
    const r = await exchangeLinearCode({
      ...base,
      fetchImpl: fakeFetch(200, {
        access_token: "tok",
        refresh_token: "ref",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "read,comments:create",
      }),
    });
    expect(r.access_token).toBe("tok");
    expect(r.refresh_token).toBe("ref");
    expect(r.expires_in).toBe(3600);
  });

  it("posts form-encoded body with required params", async () => {
    let captured: { url: string; body: string } | undefined;
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok", token_type: "Bearer" }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    await exchangeLinearCode({ ...base, fetchImpl });
    expect(captured?.url).toMatch(/api\.linear\.app\/oauth\/token/);
    expect(captured?.body).toContain("grant_type=authorization_code");
    expect(captured?.body).toContain("client_id=client");
    expect(captured?.body).toContain("code=code");
  });

  it("throws LinearOauthExchangeError on non-2xx", async () => {
    await expect(
      exchangeLinearCode({ ...base, fetchImpl: fakeFetch(401, { error: "invalid_grant" }) }),
    ).rejects.toBeInstanceOf(LinearOauthExchangeError);
  });

  it("throws when response is missing access_token", async () => {
    await expect(
      exchangeLinearCode({ ...base, fetchImpl: fakeFetch(200, { token_type: "Bearer" }) }),
    ).rejects.toThrow(/access_token/);
  });
});
