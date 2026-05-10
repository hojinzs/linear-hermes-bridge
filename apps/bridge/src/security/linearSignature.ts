import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLinearSignature(input: {
  rawBody: string;
  signature: string;
  secret: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  if (expected.length !== input.signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(input.signature, "utf8"));
}
