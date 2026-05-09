import { describe, expect, it } from "vitest";
import { LinearGraphqlClient, LinearGraphqlError } from "./client.js";

function fakeFetch(
  responder: (body: { query: string; variables?: unknown }) => {
    status?: number;
    body: unknown;
  },
): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as {
      query: string;
      variables?: unknown;
    };
    const r = responder(body);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return r.body;
      },
      async text() {
        return JSON.stringify(r.body);
      },
    } as unknown as Response;
  }) as typeof fetch;
}

describe("LinearGraphqlClient", () => {
  it("attaches Bearer header and parses commentCreate", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: "cmt_1", url: "https://x" } } },
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    const c = new LinearGraphqlClient("tok123", undefined, fetchImpl);
    const r = await c.commentCreate({ issueId: "issue_1", body: "hello" });
    expect(r.id).toBe("cmt_1");
    expect(capturedHeaders?.authorization).toBe("Bearer tok123");
  });

  it("does not double-prefix Bearer", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: "cmt", url: "u" } } },
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    const c = new LinearGraphqlClient("Bearer abc", undefined, fetchImpl);
    await c.commentCreate({ issueId: "i", body: "b" });
    expect(capturedHeaders?.authorization).toBe("Bearer abc");
  });

  it("throws LinearGraphqlError on non-2xx", async () => {
    const c = new LinearGraphqlClient(
      "tok",
      undefined,
      fakeFetch(() => ({ status: 401, body: { error: "unauthorized" } })),
    );
    await expect(c.viewer()).rejects.toBeInstanceOf(LinearGraphqlError);
  });

  it("throws LinearGraphqlError when graphql errors are returned", async () => {
    const c = new LinearGraphqlClient(
      "tok",
      undefined,
      fakeFetch(() => ({
        status: 200,
        body: { errors: [{ message: "boom" }] },
      })),
    );
    await expect(c.viewer()).rejects.toThrow(/boom/);
  });

  it("throws success=false when commentCreate returns success false", async () => {
    const c = new LinearGraphqlClient(
      "tok",
      undefined,
      fakeFetch(() => ({
        status: 200,
        body: { data: { commentCreate: { success: false, comment: { id: "x", url: "u" } } } },
      })),
    );
    await expect(c.commentCreate({ issueId: "i", body: "b" })).rejects.toThrow(/success=false/);
  });

  it("includes parentId only when provided", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { variables?: Record<string, unknown> };
      capturedVariables = body.variables;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: "c", url: "u" } } },
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    const c = new LinearGraphqlClient("tok", undefined, fetchImpl);

    await c.commentCreate({ issueId: "i", body: "b" });
    const inputA = capturedVariables?.input as Record<string, unknown>;
    expect("parentId" in inputA).toBe(false);

    await c.commentCreate({ issueId: "i", body: "b", parentId: "p1" });
    const inputB = capturedVariables?.input as Record<string, unknown>;
    expect(inputB?.parentId).toBe("p1");
  });

  it("viewer returns parsed organization", async () => {
    const c = new LinearGraphqlClient(
      "tok",
      undefined,
      fakeFetch(() => ({
        status: 200,
        body: {
          data: {
            viewer: {
              id: "u",
              name: "Steve",
              organization: { id: "org", name: "DAapp", urlKey: "daapp" },
            },
          },
        },
      })),
    );
    const v = await c.viewer();
    expect(v.organization.id).toBe("org");
    expect(v.organization.urlKey).toBe("daapp");
  });
});
