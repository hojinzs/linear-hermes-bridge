import { serve } from "@hono/node-server";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const hostname = "127.0.0.1";

const app = createServer();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[bridge] listening on http://${hostname}:${info.port}`);
});
