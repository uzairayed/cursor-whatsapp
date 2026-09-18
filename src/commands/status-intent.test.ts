import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "../projects/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function setup(): ProjectStore {
  const root = mkdtempSync(join(tmpdir(), "cwa-status-"));
  const workspace = join(root, "blog");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ blog: workspace }));
  return new ProjectStore({
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
    defaultProject: "blog",
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
  } satisfies AppConfig);
}

function ctx(projects: ProjectStore, raw: string, overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    projects,
    raw,
    getRunStatus: () => ({ busy: [], queuedCount: 0, queueDepths: [] }),
    stopCurrent: () => false,
    stopAllRuns: () => {},
    clearCurrentQueue: () => 0,
    clearAllQueues: () => 0,
    ...overrides,
  };
}

describe("status intent", () => {
  it("answers when idle", () => {
    const projects = setup();
    const result = handleUserMessage(ctx(projects, "status"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/free/i);
  });

  it("answers when busy", () => {
    const projects = setup();
    const result = handleUserMessage(ctx(projects, "are you working", {
      getRunStatus: () => ({
        busy: [{ workspace: "/tmp/blog", projectKey: "blog" }],
        queuedCount: 0,
        queueDepths: [],
      }),
    }));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/still working/i);
  });
});
