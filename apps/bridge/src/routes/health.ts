import { Hono } from "hono";

export function healthRoutes() {
  const app = new Hono();
  app.get("/healthz", (c) =>
    c.json({ ok: true, service: "linear-hermes-bridge", version: "0.0.0" }),
  );
  app.get("/readyz", (c) => c.json({ ok: true, database: "ok" }));
  return app;
}
