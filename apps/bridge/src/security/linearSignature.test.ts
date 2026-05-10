import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLinearSignature } from "./linearSignature.js";

describe("verifyLinearSignature", () => {
  const secret = "shhh-its-a-secret";
  const body = '{"hello":"world"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyLinearSignature({ rawBody: body, signature: sig, secret })).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verifyLinearSignature({ rawBody: body, signature: "0".repeat(64), secret })).toBe(false);
  });

  it("rejects when body is altered", () => {
    expect(verifyLinearSignature({ rawBody: `${body} `, signature: sig, secret })).toBe(false);
  });

  it("rejects when signature is empty", () => {
    expect(verifyLinearSignature({ rawBody: body, signature: "", secret })).toBe(false);
  });

  it("rejects when signature is wrong length (timing-safe-equal guard)", () => {
    expect(verifyLinearSignature({ rawBody: body, signature: "abc", secret })).toBe(false);
  });
});
