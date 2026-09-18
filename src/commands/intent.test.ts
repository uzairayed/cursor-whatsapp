import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "../projects/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function setup(opts: { defaultProject?: string | null } = {}): ProjectStore {
  const root = mkdtempSync(join(tmpdir(), "cwa-intent-"));
  const webapp = join(root, "webapp");
  const blog = join(root, "blog");
  mkdirSync(webapp);
  mkdirSync(blog);
  writeFileSync(
    join(root, "projects.json"),
    JSON.stringify({ webapp, blog })
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
    expect(result.reply).toMatch(/1\.\s*BLOG/i);
    expect(result.reply).toMatch(/reply with (a )?number|just reply/i);
    expect(result.reply).not.toContain("/project");
    expect(projects.isAwaitingProjectPick()).toBe(true);
  });

  it("accepts a number to choose a project", () => {
    const projects = setup();
    handleUserMessage(ctx(projects, "help"));
    const result = handleUserMessage(ctx(projects, "3"));
    expect(result.reply).toMatch(/webapp/i);
    expect(projects.getCurrent()?.key).toBe("webapp");
    expect(projects.isAwaitingProjectPick()).toBe(false);
  });

  it("understands switch to <name>", () => {
    const projects = setup({ defaultProject: "blog" });
    const result = handleUserMessage(ctx(projects, "switch to webapp"));
    expect(result.handled).toBe(true);
    expect(projects.getCurrent()?.key).toBe("webapp");
    expect(result.reply).toMatch(/webapp/i);
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
    const projects = setup({ defaultProject: "webapp" });
    const result = handleUserMessage(ctx(projects, "stop", {
      getRunStatus: () => ({
        busy: [{ workspace: "/tmp/webapp", projectKey: "webapp" }],
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
