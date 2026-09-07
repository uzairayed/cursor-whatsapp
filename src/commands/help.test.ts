import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "../projects/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function setup(withProject = true): ProjectStore {
  const root = mkdtempSync(join(tmpdir(), "cwa-help-"));
  const workspace = join(root, "cliproom");
  mkdirSync(workspace);
  writeFileSync(
    join(root, "projects.json"),
    JSON.stringify({ cliproom: workspace, tagiser: join(root, "tagiser") })
  );
  mkdirSync(join(root, "tagiser"));
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
    defaultProject: withProject ? "cliproom" : null,
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

describe("help", () => {
  it("sounds human and prompts a numbered project choice", () => {
    const projects = setup(true);
    const result = handleUserMessage(ctx(projects, "help"));

    expect(result.reply).toMatch(/hey|hi|hello/i);
    expect(result.reply).toMatch(/just text|text me|send/i);
    expect(result.reply?.toLowerCase()).toContain("cliproom");
    expect(result.reply).toMatch(/1\./);
    expect(result.reply).toMatch(/new chat/i);
    expect(result.reply).not.toContain("/project");
  });

  it("mentions filing a GitHub issue via forward or issue", () => {
    const projects = setup(true);
    const result = handleUserMessage(ctx(projects, "help"));

    expect(result.reply).toMatch(/github/i);
    expect(result.reply).toMatch(/\bissue\b/i);
    expect(result.reply).toMatch(/forward/i);
  });
});
