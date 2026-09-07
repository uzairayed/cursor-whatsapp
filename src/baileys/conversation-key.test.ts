import { describe, expect, it } from "vitest";
import { buildConversationKey } from "./conversation-key.js";

describe("buildConversationKey", () => {
  it("prefers wa:<phone> when phone resolves", () => {
    expect(buildConversationKey("923001234567", "111000000000001@lid")).toBe(
      "wa:923001234567"
    );
  });

  it("falls back to lid:<jid> when phone is null — never the bare general key", () => {
    expect(buildConversationKey(null, "111000000000001@lid")).toBe(
      "lid:111000000000001@lid"
    );
  });

  it("falls back to lid:<jid> when phone is null for a standard jid", () => {
    expect(buildConversationKey(null, "923001234567@s.whatsapp.net")).toBe(
      "lid:923001234567@s.whatsapp.net"
    );
  });
});
