import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "../projects/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function setup(opts: { defaultProject?: string | null } = {}): ProjectStore {
  const root = mkdtempSync(join(tmpdir(), "cwa-intent-"));
  const cliproom = join(root, "cliproom");
  const tagiser = join(root, "tagiser");
  mkdirSync(cliproom);
  mkdirSync(tagiser);
  writeFileSync(
    join(root, "projects.json"),
    JSON.stringify({ cliproom, tagiser })
  );
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
    defaultProject: opts.defaultProject ?? null,
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
  };
  return new ProjectStore(config);
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

describe("conversational intents", () => {
  it("help asks the user to pick a project by number, without slash commands", () => {
    const projects = setup();
    const result = handleUserMessage(ctx(projects, "help"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/hey|hi|hello/i);
    expect(result.reply).toMatch(/1\.\s*CLIPROOM/i);
    expect(result.reply).toMatch(/reply with (a )?number|just reply/i);
    expect(result.reply).not.toContain("/project");
    expect(projects.isAwaitingProjectPick()).toBe(true);
  });

  it("accepts a number to choose a project", () => {
    const projects = setup();
    handleUserMessage(ctx(projects, "help"));
    const result = handleUserMessage(ctx(projects, "3"));
    expect(result.reply).toMatch(/tagiser/i);
    expect(projects.getCurrent()?.key).toBe("tagiser");
    expect(projects.isAwaitingProjectPick()).toBe(false);
  });

  it("understands switch to <name>", () => {
    const projects = setup({ defaultProject: "tagiser" });
    const result = handleUserMessage(ctx(projects, "switch to cliproom"));
    expect(result.handled).toBe(true);
    expect(projects.getCurrent()?.key).toBe("cliproom");
    expect(result.reply).toMatch(/cliproom/i);
  });

  it("prompts to choose a project before running a normal prompt", () => {
    const projects = setup();
    const result = handleUserMessage(ctx(projects, "fix the login bug"));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/which project/i);
    expect(result.reply).toMatch(/1\./);
    expect(projects.isAwaitingProjectPick()).toBe(true);
  });

  it("stops with plain language", () => {
    let stopped = false;
    const projects = setup({ defaultProject: "cliproom" });
    const result = handleUserMessage(ctx(projects, "stop", {
      getRunStatus: () => ({
        busy: [{ workspace: "/tmp/cliproom", projectKey: "cliproom" }],
        queuedCount: 0,
        queueDepths: [],
      }),
      stopCurrent: () => {
        stopped = true;
        return true;
      },
    }));
    expect(stopped).toBe(true);
    expect(result.reply).toMatch(/stop/i);
  });
});
