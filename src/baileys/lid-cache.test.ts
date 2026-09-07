import { describe, expect, it } from "vitest";
import { phoneFromLidCache, rememberLidPhone } from "./lid-cache.js";

describe("lid-cache", () => {
  it("remembers phone for a LID jid", () => {
    rememberLidPhone("111000000000001@lid", "923001234567");
    expect(phoneFromLidCache("111000000000001@lid")).toBe("923001234567");
    expect(phoneFromLidCache("other@lid")).toBeNull();
  });
});
