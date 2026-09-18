import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ConversationManager } from "../conversation/index.js";
import { ProjectStore } from "../projects/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "cwa-newchat-"));
  const workspace = join(root, "webapp");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ webapp: workspace }));
  const config: AppConfig = {
    rootDir: root,
    projectsFile: join(root, "projects.json"),
    historyDir: join(root, "history"),
    logsDir: join(root, "logs"),
    authDir: join(root, "auth_info"),
    stateFile: join(root, "state.json"),
    cursorBin: "cursor",
    allowedNumbers: [],
    casualNumbers: [],
    generalDir: join(root, "general"),
    defaultProject: "webapp",
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
  };
  const projects = new ProjectStore(config);
  const conversations = new ConversationManager(config.historyDir);
  conversations.setChatId("webapp", "old-session-123");
  return { projects, conversations };
}

function ctx(projects: ProjectStore, raw: string, conversations?: ConversationManager): CommandContext {
  return {
    projects,
    raw,
    conversations,
    getRunStatus: () => ({ busy: [], queuedCount: 0, queueDepths: [] }),
    stopCurrent: () => false,
    stopAllRuns: () => {},
    clearCurrentQueue: () => 0,
    clearAllQueues: () => 0,
  };
}

describe("new chat", () => {
  it("clears the Cursor session for the current project", () => {
    const { projects, conversations } = setup();
    expect(conversations.getChatId("webapp")).toBe("old-session-123");

    const result = handleUserMessage(ctx(projects, "new chat", conversations));

    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/fresh|new chat|clean slate/i);
    expect(result.reply?.toLowerCase()).toContain("webapp");
    expect(conversations.getChatId("webapp")).toBeNull();
  });

  it("also understands start fresh", () => {
    const { projects, conversations } = setup();
    const result = handleUserMessage(ctx(projects, "start fresh", conversations));
    expect(result.handled).toBe(true);
    expect(conversations.getChatId("webapp")).toBeNull();
  });
});
