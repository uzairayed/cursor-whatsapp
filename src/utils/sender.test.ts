import { describe, expect, it } from "vitest";
import { resolveSenderJid, resolveSenderPhone } from "./sender.js";

describe("resolveSenderJid", () => {
  it("prefers remoteJid when it is a classic phone JID", () => {
    expect(
      resolveSenderJid({
        key: { remoteJid: "923001234567@s.whatsapp.net" },
      } as never)
    ).toBe("923001234567@s.whatsapp.net");
  });

  it("falls back to remoteJidAlt when remoteJid is a LID", () => {
    expect(
      resolveSenderJid({
        key: {
          remoteJid: "123456789012345@lid",
          remoteJidAlt: "923001234567@s.whatsapp.net",
        },
      } as never)
    ).toBe("923001234567@s.whatsapp.net");
  });
});

describe("resolveSenderPhone", () => {
  it("extracts phone from LID messages via remoteJidAlt", () => {
    expect(
      resolveSenderPhone({
        key: {
          remoteJid: "123456789012345@lid",
          remoteJidAlt: "923001234567@s.whatsapp.net",
        },
      } as never)
    ).toBe("923001234567");
  });
});
