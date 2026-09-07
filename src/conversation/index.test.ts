import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationManager } from "./index.js";

describe("ConversationManager", () => {
  it("stores chat id and messages per project", () => {
    const dir = mkdtempSync(join(tmpdir(), "cwa-hist-"));
    const mgr = new ConversationManager(dir);

    mgr.setChatId("crm", "session-abc");
    mgr.append("crm", "fix login", "done", "session-abc");

    const state = mgr.load("crm");
    expect(state.chatId).toBe("session-abc");
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.messages[1]?.content).toBe("done");

    expect(mgr.load("fleet").messages).toHaveLength(0);
  });

  // AC#4 – smart history rotation: lastInputTokens persisted
  it("persists lastInputTokens on state when usage is supplied to append", () => {
    const dir = mkdtempSync(join(tmpdir(), "cwa-hist-"));
    const mgr = new ConversationManager(dir);

    mgr.append("crm", "do work", "done", "sess-1", { inputTokens: 85_000 });

    const state = mgr.load("crm");
    expect(state.lastInputTokens).toBe(85_000);
  });

  it("does not set lastInputTokens when no usage is supplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "cwa-hist-"));
    const mgr = new ConversationManager(dir);

    mgr.append("crm", "do work", "done", "sess-1");

    const state = mgr.load("crm");
    expect(state.lastInputTokens).toBeUndefined();
  });
});
