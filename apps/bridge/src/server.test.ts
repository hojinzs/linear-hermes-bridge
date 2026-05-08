import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("returns health status", async () => {
    const app = createServer();

    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "linear-hermes-bridge",
      version: "0.0.0",
    });
  });
});
