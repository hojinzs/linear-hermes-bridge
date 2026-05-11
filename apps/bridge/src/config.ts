import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const Schema = z.object({
  PUBLIC_BASE_URL: z.string().url(),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be numeric")
    .transform(Number)
    .pipe(z.number().int().positive()),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY required")
    .refine((v) => {
      try {
        return Buffer.from(v, "base64").length === 32;
      } catch {
        return false;
      }
    }, "ENCRYPTION_KEY must be 32 bytes base64"),
  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 chars"),
  HOST: z.string().min(1).default("127.0.0.1"),
  LINEAR_LIVE: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("false"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  WORKSPACE_ROOT: z.string().min(1).default("./data/workspaces"),
});

export type Config = {
  publicBaseUrl: string;
  port: number;
  host: string;
  databaseUrl: string;
  encryptionKey: Buffer;
  appSecret: string;
  linearLive: boolean;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  workspaceRoot: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`Invalid configuration: ${issues}`);
  }
  return {
    publicBaseUrl: parsed.data.PUBLIC_BASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    databaseUrl: parsed.data.DATABASE_URL,
    encryptionKey: Buffer.from(parsed.data.ENCRYPTION_KEY, "base64"),
    appSecret: parsed.data.APP_SECRET,
    linearLive: parsed.data.LINEAR_LIVE,
    logLevel: parsed.data.LOG_LEVEL,
    workspaceRoot: parsed.data.WORKSPACE_ROOT,
  };
}
