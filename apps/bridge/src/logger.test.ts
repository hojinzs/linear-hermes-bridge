import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

function captureLogs(fn: (logger: ReturnType<typeof createLogger>) => void): string[] {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = createLogger({ level: "info", stream });
  fn(logger);
  return lines;
}

describe("logger", () => {
  it("redacts known secret keys", () => {
    const logs = captureLogs((l) => {
      l.info({ access_token: "leaked", webhook_secret: "leaked", normal: "ok" }, "message");
    });
    const joined = logs.join("\n");
    expect(joined).not.toContain("leaked");
    expect(joined).toContain("[Redacted]");
    expect(joined).toContain("ok");
  });

  it("redacts Authorization header", () => {
    const logs = captureLogs((l) => l.info({ headers: { Authorization: "Bearer leaked" } }, "x"));
    expect(logs.join("\n")).not.toContain("leaked");
  });

  it("emits a parseable JSON line", () => {
    const logs = captureLogs((l) => l.info({ tag: "hello" }, "msg"));
    const parsed = JSON.parse(logs[0] ?? "{}");
    expect(parsed.msg).toBe("msg");
    expect(parsed.tag).toBe("hello");
  });
});
