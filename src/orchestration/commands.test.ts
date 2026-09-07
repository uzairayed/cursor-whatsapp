import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { handleUserMessage, type CommandContext } from "../commands/index.js";
import { ProjectStore } from "../projects/index.js";

function setupStore(): ProjectStore {
  const root = mkdtempSync(join(tmpdir(), "cwa-mode-cmd-"));
  mkdirSync(join(root, "crm"));
  writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: join(root, "crm") }));
  const config: AppConfig = {
    rootDir: root,
    projectsFile: join(root, "projects.json"),
    historyDir: join(root, "history"),
    logsDir: join(root, "logs"),
    authDir: join(root, "auth_info"),
    stateFile: join(root, "state.json"),
    cursorBin: "cursor",
    allowedNumbers: ["1"],
    casualNumbers: [],
    generalDir: join(root, "general"),
    defaultProject: "crm",
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
  };
  return new ProjectStore(config);
}

function ctx(projects: ProjectStore, raw: string): CommandContext {
  return {
    projects,
    raw,
    getRunStatus: () => ({ busy: [], queuedCount: 0, queueDepths: [] }),
    stopCurrent: () => false,
    stopAllRuns: () => {},
    clearCurrentQueue: () => 0,
    clearAllQueues: () => 0,
  };
}

describe("agent mode commands", () => {
  it("switches to solo and confirms", () => {
    const projects = setupStore();
    const result = handleUserMessage(ctx(projects, "solo"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/solo/i);
    expect(projects.getAgentMode()).toBe("solo");
  });

  it("switches to orchestrate and confirms", () => {
    const projects = setupStore();
    projects.setAgentMode("solo");
    const result = handleUserMessage(ctx(projects, "use agents"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/orchestrate/i);
    expect(projects.getAgentMode()).toBe("orchestrate");
  });

  it("reports the current mode", () => {
    const projects = setupStore();
    projects.setAgentMode("solo");
    const result = handleUserMessage(ctx(projects, "which mode"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/solo/i);
  });

  it("mentions orchestrate vs solo in help", () => {
    const projects = setupStore();
    const result = handleUserMessage(ctx(projects, "help"));
    expect(result.reply).toMatch(/orchestrate/i);
    expect(result.reply).toMatch(/solo/i);
  });

  it("refuses orchestrate when current project is general", () => {
    const projects = setupStore();
    projects.setCurrent("general");
    projects.setAgentMode("solo");
    const result = handleUserMessage(ctx(projects, "orchestrate"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/general chat/i);
    expect(result.reply).not.toMatch(/switched to \*orchestrate\*/i);
    expect(projects.getAgentMode()).toBe("solo");
  });

  it("refuses which mode when current project is general", () => {
    const projects = setupStore();
    projects.setCurrent("general");
    const result = handleUserMessage(ctx(projects, "which mode"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/general chat/i);
  });
});
