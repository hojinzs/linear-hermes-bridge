import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto/encryption.js";
import { type DbClient, schema } from "../db/client.js";
import { LinearOauthExchangeError, exchangeRefreshLinearToken } from "../linear/oauthExchange.js";

export type RefreshableInstallation = {
  id: string;
  refreshTokenEnc: string | null;
  tokenExpiresAt: string | null;
};

export type RefreshLinearTokenInput = {
  db: DbClient;
  installation: RefreshableInstallation;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  fetchImpl?: typeof fetch;
  /** ms before recorded expiry to start refreshing. Default 60_000. */
  bufferMs?: number;
  /** Test seam. */
  now?: () => Date;
};

export type RefreshLinearTokenResult =
  | { refreshed: false }
  | { refreshed: true; accessToken: string };

export async function refreshLinearTokenIfNeeded(
  input: RefreshLinearTokenInput,
): Promise<RefreshLinearTokenResult> {
  const { db, installation, encryptionKey } = input;
  if (!installation.refreshTokenEnc) return { refreshed: false };
  if (!installation.tokenExpiresAt) return { refreshed: false };

  const now = (input.now ?? (() => new Date()))();
  const bufferMs = input.bufferMs ?? 60_000;
  const expiresAt = new Date(installation.tokenExpiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - now.getTime() > bufferMs) {
    return { refreshed: false };
  }

  const refreshToken = decrypt(installation.refreshTokenEnc, encryptionKey);

  let token: Awaited<ReturnType<typeof exchangeRefreshLinearToken>>;
  try {
    token = await exchangeRefreshLinearToken({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken,
      ...(input.fetchImpl && { fetchImpl: input.fetchImpl }),
    });
  } catch (err) {
    // Per OAuth2 RFC 6749 §5.2, only `invalid_grant` indicates a refresh token
    // that will never work again (revocation, expiry, reuse). Other 4xx errors
    // (`invalid_client`, `invalid_request`, etc.) signal misconfiguration and
    // 5xx are transient — neither should flip the installation to revoked.
    if (err instanceof LinearOauthExchangeError && err.errorCode === "invalid_grant") {
      db.update(schema.linearInstallations)
        .set({ status: "revoked", updatedAt: now.toISOString() })
        .where(eq(schema.linearInstallations.id, installation.id))
        .run();
    }
    throw err;
  }

  const newExpiresAt = token.expires_in
    ? new Date(now.getTime() + token.expires_in * 1000).toISOString()
    : null;
  db.update(schema.linearInstallations)
    .set({
      accessTokenEnc: encrypt(token.access_token, encryptionKey),
      refreshTokenEnc: token.refresh_token
        ? encrypt(token.refresh_token, encryptionKey)
        : installation.refreshTokenEnc,
      tokenExpiresAt: newExpiresAt,
      status: "installed",
      updatedAt: now.toISOString(),
    })
    .where(eq(schema.linearInstallations.id, installation.id))
    .run();

  return { refreshed: true, accessToken: token.access_token };
}
