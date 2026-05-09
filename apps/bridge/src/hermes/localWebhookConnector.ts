import { createHmac } from "node:crypto";
import type { HermesConnector } from "./connector.js";
import type { HermesRunInput, HermesRunResult } from "./types.js";

type Config = {
  url: string;
  hmacSecret: string;
  timeoutMs?: number;
  deliverMode?: "awaitResponse" | "fireAndForget";
  signatureHeader?: string;
  signaturePrefix?: string;
};

function asConfig(
  raw: unknown,
): Required<Pick<Config, "url" | "hmacSecret">> &
  Required<Pick<Config, "timeoutMs" | "deliverMode" | "signatureHeader" | "signaturePrefix">> {
  const o = raw as Partial<Config> | null | undefined;
  if (!o || typeof o.url !== "string" || typeof o.hmacSecret !== "string") {
    throw new Error("invalid localWebhook config: url and hmacSecret required");
  }
  return {
    url: o.url,
    hmacSecret: o.hmacSecret,
    timeoutMs: typeof o.timeoutMs === "number" ? o.timeoutMs : 120_000,
    deliverMode: o.deliverMode ?? "awaitResponse",
    signatureHeader: o.signatureHeader ?? "x-webhook-signature",
    signaturePrefix: o.signaturePrefix ?? "",
  };
}

export function localWebhookConnector(rawConfig: unknown): HermesConnector {
  const config = asConfig(rawConfig);
  return {
    type: "localWebhook",
    async ping() {
      const start = Date.now();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(config.url, { method: "HEAD", signal: ctrl.signal });
        clearTimeout(t);
        return { ok: res.status < 500, latencyMs: Date.now() - start };
      } catch {
        return { ok: false, latencyMs: Date.now() - start };
      }
    },
    async run(input: HermesRunInput): Promise<HermesRunResult> {
      const body = JSON.stringify({
        agentRunJobId: input.agentRunJobId,
        runAttemptId: input.runAttemptId,
        agentId: input.agentId,
        prompt: input.prompt,
        userInstruction: input.userInstruction,
        hermesSessionKey: input.hermesSessionKey,
      });
      const hex = createHmac("sha256", config.hmacSecret).update(body).digest("hex");
      const signatureValue = `${config.signaturePrefix}${hex}`;
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      input.signal.addEventListener("abort", onAbort, { once: true });
      const t = setTimeout(() => ctrl.abort(), config.timeoutMs);
      try {
        const res = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [config.signatureHeader]: signatureValue,
          },
          body,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: `hermes http ${res.status}: ${text.slice(0, 200)}` };
        }
        const json = (await res.json()) as {
          ok?: boolean;
          summary?: string;
          events?: unknown[];
          status?: string;
        };
        // Accept either explicit ok:true or a 2xx accepted-style response
        if (json.ok === false) return { ok: false, error: "hermes returned ok=false" };
        return {
          ok: true,
          output: {
            summary:
              typeof json.summary === "string"
                ? json.summary
                : typeof json.status === "string"
                  ? `(hermes ${json.status})`
                  : "(no summary)",
            events: Array.isArray(json.events) ? json.events : [],
          },
          hermesSessionKey: input.hermesSessionKey ?? "lwh_unknown",
        };
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        return { ok: false, error: /abort/i.test(msg) ? "timeout or abort" : msg };
      } finally {
        clearTimeout(t);
        input.signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
