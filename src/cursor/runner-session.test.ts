import { describe, expect, it } from "vitest";
import type { CursorRunOptions } from "./runner.js";

describe("CursorRunOptions.sessionKey", () => {
  it("accepts sessionKey as an optional field", () => {
    const opts: CursorRunOptions = {
      cursorBin: "/usr/bin/cursor",
      workspace: "/tmp/ws",
      prompt: "hello",
      projectKey: "general",
      conversations: { getChatId: () => null, setChatId: () => {} } as any,
      sessionKey: "general__wa:923001234567",
    };

    expect(opts.sessionKey).toBe("general__wa:923001234567");
  });

  it("allows sessionKey to be omitted (backward-compatible)", () => {
    const opts: CursorRunOptions = {
      cursorBin: "/usr/bin/cursor",
      workspace: "/tmp/ws",
      prompt: "hello",
      projectKey: "general",
      conversations: { getChatId: () => null, setChatId: () => {} } as any,
    };

    expect(opts.sessionKey).toBeUndefined();
  });
});
