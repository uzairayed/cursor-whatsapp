import { describe, expect, it } from "vitest";
import { resolveAllowedNumbers, resolveCasualNumbers, resolveAccessRole } from "./allowlist.js";

describe("resolveAllowedNumbers", () => {
  it("uses ALLOWED_NUMBERS when set", () => {
    expect(resolveAllowedNumbers("923001111111", "923002222222")).toEqual([
      "923001111111",
    ]);
  });

  it("falls back to ADMIN_WHATSAPP_PHONE", () => {
    expect(resolveAllowedNumbers(undefined, "923003333333")).toEqual([
      "923003333333",
    ]);
  });

  it("parses comma-separated numbers and strips non-digits", () => {
    expect(resolveAllowedNumbers("+92 300-1111111, 923002222222", undefined)).toEqual([
      "923001111111",
      "923002222222",
    ]);
  });
});

describe("resolveCasualNumbers", () => {
  it("parses comma-separated digits-only", () => {
    expect(resolveCasualNumbers("+92 333-4445556, 923117778899")).toEqual([
      "923334445556",
      "923117778899",
    ]);
  });

  it("returns string[]", () => {
    const result = resolveCasualNumbers("923001234567");
    expect(Array.isArray(result)).toBe(true);
    expect(typeof result[0]).toBe("string");
  });

  it("returns [] when undefined", () => {
    expect(resolveCasualNumbers(undefined)).toEqual([]);
  });

  it("returns [] when empty string", () => {
    expect(resolveCasualNumbers("")).toEqual([]);
  });

  it("returns [] when whitespace-only", () => {
    expect(resolveCasualNumbers("   ")).toEqual([]);
  });
});

describe("resolveAccessRole", () => {
  const owners = ["923001111111", "923002222222"];
  const casual = ["923003333333", "923004444444"];

  it("returns 'owner' when phone is in owners list", () => {
    expect(resolveAccessRole("923001111111", owners, casual)).toBe("owner");
  });

  it("returns 'casual' when phone is in casual list only", () => {
    expect(resolveAccessRole("923003333333", owners, casual)).toBe("casual");
  });

  it("returns 'owner' when phone is in BOTH lists (owner wins)", () => {
    const both = ["923001111111", "923003333333"];
    expect(resolveAccessRole("923001111111", owners, both)).toBe("owner");
  });

  it("returns 'denied' when phone is in neither list", () => {
    expect(resolveAccessRole("923009999999", owners, casual)).toBe("denied");
  });

  it("returns 'denied' for null phone", () => {
    expect(resolveAccessRole(null, owners, casual)).toBe("denied");
  });

  it("returns 'denied' for undefined phone", () => {
    expect(resolveAccessRole(undefined, owners, casual)).toBe("denied");
  });

  it("uses endsWith matching (flexible like isAllowedPhone)", () => {
    expect(resolveAccessRole("92923001111111", owners, casual)).toBe("owner");
  });

  it("uses endsWith matching for casual numbers", () => {
    expect(resolveAccessRole("92923003333333", owners, casual)).toBe("casual");
  });
});
