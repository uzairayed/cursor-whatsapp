import { describe, expect, it } from "vitest";
import { shouldHandleUpsertType } from "./upsert-type.js";

describe("shouldHandleUpsertType", () => {
  it("only handles live notify deliveries, not history append sync", () => {
    expect(shouldHandleUpsertType("notify")).toBe(true);
    expect(shouldHandleUpsertType("append")).toBe(false);
    expect(shouldHandleUpsertType("other")).toBe(false);
  });
});
