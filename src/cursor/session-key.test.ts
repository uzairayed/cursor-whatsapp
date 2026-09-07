import { describe, expect, it } from "vitest";
import { sessionStorageKey } from "./session-key.js";

describe("sessionStorageKey", () => {
  it("returns projectKey alone when no conversationKey is given", () => {
    expect(sessionStorageKey("crm")).toBe("crm");
  });

  it("joins projectKey and conversationKey with double underscore", () => {
    expect(sessionStorageKey("general", "wa:923001234567")).toBe(
      "general__wa:923001234567",
    );
  });

  it("returns projectKey when conversationKey is undefined", () => {
    expect(sessionStorageKey("general", undefined)).toBe("general");
  });

  it("produces distinct keys for different phones", () => {
    const a = sessionStorageKey("general", "wa:923001111111");
    const b = sessionStorageKey("general", "wa:923002222222");
    expect(a).not.toBe(b);
  });
});
