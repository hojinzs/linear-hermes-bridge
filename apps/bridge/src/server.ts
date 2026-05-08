import { Hono } from "hono";

export function createServer() {
  const app = new Hono();
  app.get("/healthz", (c) =>
    c.json({ ok: true, service: "linear-hermes-bridge", version: "0.0.0" }),
  );
  return app;
}
