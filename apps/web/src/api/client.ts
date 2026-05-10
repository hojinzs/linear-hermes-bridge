type Json = unknown;

async function req<T = Json>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export type AgentListItem = {
  slug: string;
  displayName: string;
  enabled: boolean;
  hermesConnectorType: string;
  callbackUrl: string;
  webhookUrl: string;
  installUrl: string;
};

export const api = {
  agents: {
    list: () => req<{ agents: AgentListItem[] }>("/api/agents"),
    get: (slug: string) => req<{ agent: AgentListItem }>(`/api/agents/${slug}`),
    create: (body: unknown) =>
      req<{ agent: AgentListItem }>("/api/agents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    enable: (slug: string) => req(`/api/agents/${slug}/enable`, { method: "POST" }),
    disable: (slug: string) => req(`/api/agents/${slug}/disable`, { method: "POST" }),
    testHermes: (slug: string) =>
      req<{ ok: boolean; latencyMs: number }>(`/api/agents/${slug}/test-hermes`, {
        method: "POST",
      }),
  },
  installations: {
    list: (slug: string) =>
      req<{
        installations: {
          id: string;
          organizationId: string;
          organizationName?: string | null;
          status: string;
          scopes: string[];
        }[];
      }>(`/api/agents/${slug}/installations`),
  },
  runJobs: {
    list: (params?: { agentSlug?: string; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.agentSlug) query.set("agentSlug", params.agentSlug);
      if (params?.status) query.set("status", params.status);
      const qs = query.toString();
      return req<{ jobs: unknown[] }>(`/api/agent-run-jobs${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => req<{ job: unknown; events: unknown[] }>(`/api/agent-run-jobs/${id}`),
    cancel: (id: string) =>
      req<{ ok: boolean }>(`/api/agent-run-jobs/${id}/cancel`, { method: "POST" }),
  },
};
