import { describe, expect, it } from "vitest";
import { resolveReplyJid } from "./reply-jid.js";

describe("resolveReplyJid", () => {
  it("replies on the LID/session JID when present (required for decryptable delivery)", () => {
    expect(
      resolveReplyJid({
        senderJid: "111000000000001@lid",
        phone: "923001234567",
      })
    ).toBe("111000000000001@lid");
  });

  it("uses phone JID only when there is no LID session jid", () => {
    expect(
      resolveReplyJid({
        senderJid: "923001234567@s.whatsapp.net",
        phone: "923001234567",
      })
    ).toBe("923001234567@s.whatsapp.net");
  });
});
