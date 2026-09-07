import { describe, expect, it } from "vitest";
import { assertAllowlistConfigured } from "./allowlist.js";

describe("assertAllowlistConfigured", () => {
  it("throws a clear error when the allowlist is empty", () => {
    expect(() => assertAllowlistConfigured([])).toThrow(
      /ALLOWED_NUMBERS|ADMIN_WHATSAPP_PHONE|empty/i
    );
  });

  it("passes when at least one number is configured", () => {
    expect(() => assertAllowlistConfigured(["923001234567"])).not.toThrow();
  });
});
