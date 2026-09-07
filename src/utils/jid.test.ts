import { describe, expect, it } from "vitest";
import { isAllowedSender, phoneFromJid } from "./jid.js";

describe("phoneFromJid", () => {
  it("extracts digits from a WhatsApp JID", () => {
    expect(phoneFromJid("923001234567@s.whatsapp.net")).toBe("923001234567");
  });
});

describe("isAllowedSender", () => {
  it("denies everyone when allowlist is empty (fail-closed)", () => {
    expect(isAllowedSender("923001234567@s.whatsapp.net", [])).toBe(false);
  });

  it("allows only listed owner numbers", () => {
    const allowed = ["923001234567"];
    expect(isAllowedSender("923001234567@s.whatsapp.net", allowed)).toBe(true);
    expect(isAllowedSender("923009999999@s.whatsapp.net", allowed)).toBe(false);
  });
});
