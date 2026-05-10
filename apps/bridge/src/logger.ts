import pino, { type LoggerOptions, type DestinationStream } from "pino";

const REDACT_PATHS = [
  "access_token",
  "refresh_token",
  "client_secret",
  "webhook_secret",
  "encryption_key",
  "ENCRYPTION_KEY",
  "Authorization",
  "authorization",
  "headers.Authorization",
  "headers.authorization",
  "*.access_token",
  "*.refresh_token",
  "*.client_secret",
  "*.webhook_secret",
];

export type AppLogger = pino.Logger;

export function createLogger(opts?: {
  level?: pino.Level;
  stream?: DestinationStream;
}): AppLogger {
  const options: LoggerOptions = {
    level: opts?.level ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    base: { service: "linear-hermes-bridge" },
  };
  return opts?.stream ? pino(options, opts.stream) : pino(options);
}
