import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../logger.js";
import { mockWriter } from "./mockWriter.js";

describe("mockWriter", () => {
  it("returns a synthetic comment id and logs the call", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _e, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger({ level: "info", stream });
    const w = mockWriter(logger);
    const r = await w.postComment({
      agentRunJobId: "arj_1",
      runAttemptId: "ra_1",
      organizationId: "org_dev",
      issueId: "issue_1",
      body: "hello",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.commentId.startsWith("mock_cmt_")).toBe(true);
    expect(lines.some((l) => l.includes("mock.linear.comment"))).toBe(true);
  });
});
