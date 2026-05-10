import { describe, expect, it } from "vitest";
import {
  LinearOauthExchangeError,
  exchangeLinearCode,
  exchangeRefreshLinearToken,
} from "./oauthExchange.js";

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

  it("preserves OAuth2 error code from the response body", async () => {
    await expect(
      exchangeLinearCode({ ...base, fetchImpl: fakeFetch(401, { error: "invalid_grant" }) }),
    ).rejects.toMatchObject({ name: "LinearOauthExchangeError", errorCode: "invalid_grant" });
  });

  it("throws when response is missing access_token", async () => {
    await expect(
      exchangeLinearCode({ ...base, fetchImpl: fakeFetch(200, { token_type: "Bearer" }) }),
    ).rejects.toThrow(/access_token/);
  });
});

describe("exchangeRefreshLinearToken", () => {
  const base = {
    clientId: "client",
    clientSecret: "secret",
    refreshToken: "ref-old",
  };

  it("posts grant_type=refresh_token and returns parsed response", async () => {
    let captured: { url: string; body: string } | undefined;
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "tok-new",
          refresh_token: "ref-new",
          token_type: "Bearer",
          expires_in: 7200,
          scope: "read,comments:create",
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    const r = await exchangeRefreshLinearToken({ ...base, fetchImpl });
    expect(captured?.url).toMatch(/api\.linear\.app\/oauth\/token/);
    expect(captured?.body).toContain("grant_type=refresh_token");
    expect(captured?.body).toContain("refresh_token=ref-old");
    expect(captured?.body).toContain("client_id=client");
    expect(r.access_token).toBe("tok-new");
    expect(r.refresh_token).toBe("ref-new");
    expect(r.expires_in).toBe(7200);
  });

  it("throws LinearOauthExchangeError on non-2xx with status preserved", async () => {
    await expect(
      exchangeRefreshLinearToken({
        ...base,
        fetchImpl: fakeFetch(401, { error: "invalid_grant" }),
      }),
    ).rejects.toMatchObject({ name: "LinearOauthExchangeError", status: 401 });
  });

  it("preserves OAuth2 error code on refresh failure", async () => {
    await expect(
      exchangeRefreshLinearToken({
        ...base,
        fetchImpl: fakeFetch(401, { error: "invalid_grant" }),
      }),
    ).rejects.toMatchObject({ errorCode: "invalid_grant" });
  });

  it("preserves errorCode for non-revocation 4xx (e.g. invalid_client)", async () => {
    await expect(
      exchangeRefreshLinearToken({
        ...base,
        fetchImpl: fakeFetch(401, { error: "invalid_client" }),
      }),
    ).rejects.toMatchObject({ errorCode: "invalid_client" });
  });

  it("throws when response is missing access_token", async () => {
    await expect(
      exchangeRefreshLinearToken({
        ...base,
        fetchImpl: fakeFetch(200, { token_type: "Bearer" }),
      }),
    ).rejects.toThrow(/access_token/);
  });
});
