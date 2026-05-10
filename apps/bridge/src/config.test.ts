import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  const valid = {
    PUBLIC_BASE_URL: "http://localhost:5173",
    PORT: "8787",
    DATABASE_URL: "file:./data/bridge.db",
    ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    APP_SECRET: "x".repeat(32),
    LINEAR_LIVE: "false",
    LOG_LEVEL: "info",
  };

  it("parses a valid environment", () => {
    const cfg = loadConfig(valid);
    expect(cfg.port).toBe(8787);
    expect(cfg.linearLive).toBe(false);
    expect(cfg.encryptionKey.length).toBe(32);
  });

  it("rejects missing ENCRYPTION_KEY", () => {
    expect(() => loadConfig({ ...valid, ENCRYPTION_KEY: "" })).toThrow(ConfigError);
  });

  it("rejects ENCRYPTION_KEY that is not 32 bytes when decoded", () => {
    expect(() => loadConfig({ ...valid, ENCRYPTION_KEY: "short" })).toThrow(ConfigError);
  });

  it("rejects APP_SECRET shorter than 16 chars", () => {
    expect(() => loadConfig({ ...valid, APP_SECRET: "short" })).toThrow(ConfigError);
  });

  it("rejects non-numeric PORT", () => {
    expect(() => loadConfig({ ...valid, PORT: "abc" })).toThrow(ConfigError);
  });

  it("treats LINEAR_LIVE='true' as boolean true", () => {
    expect(loadConfig({ ...valid, LINEAR_LIVE: "true" }).linearLive).toBe(true);
  });
});
