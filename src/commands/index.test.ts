import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationManager } from "../conversation/index.js";
import { ProjectStore } from "../projects/index.js";
import type { AppConfig } from "../config/index.js";
import { handleUserMessage, type CommandContext } from "./index.js";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "cwa-"));
  const projectsFile = join(root, "projects.json");
  writeFileSync(
    projectsFile,
    JSON.stringify({ crm: join(root, "crm"), fleet: join(root, "fleet") })
  );
  return {
    rootDir: root,
    projectsFile,
    historyDir: join(root, "history"),
    logsDir: join(root, "logs"),
    authDir: join(root, "auth_info"),
    stateFile: join(root, "state.json"),
    cursorBin: "cursor",
    allowedNumbers: [],
    defaultProject: null,
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
    ...overrides,
  };
}

function idleStatus() {
  return { busy: [], queuedCount: 0, queueDepths: [] };
}

function busyStatus(projectKey = "crm") {
  return {
    busy: [{ workspace: "/tmp/crm", projectKey }],
    queuedCount: 0,
    queueDepths: [],
  };
}

function baseCtx(projects: ProjectStore, overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    projects,
    raw: "",
    getRunStatus: () => idleStatus(),
    stopCurrent: () => false,
    stopAllRuns: () => {},
    clearCurrentQueue: () => 0,
    clearAllQueues: () => 0,
    ...overrides,
  };
}

describe("casual access", () => {
  function casualCtx(projects: ProjectStore, overrides: Partial<CommandContext> = {}): CommandContext {
    return baseCtx(projects, { access: "casual", ...overrides });
  }

  it("help returns casual-specific message without project picker", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "help" }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/casual|general/);
    expect(result.reply).not.toMatch(/1\.\s/);
  });

  it("projects command is refused for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "projects" }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/no project access|casual/);
  });

  it("orchestrate is refused for casual access without changing global mode", () => {
    const projects = new ProjectStore(
      testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") })
    );
    projects.setAgentMode("solo");
    const result = handleUserMessage(casualCtx(projects, { raw: "orchestrate" }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/general chat/);
    expect(projects.getAgentMode()).toBe("solo");
  });

  it("switch to project is refused for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "switch to crm" }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/no project access|casual/);
  });

  it("numbered pick is refused for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    projects.setAwaitingProjectPick(true);
    const result = handleUserMessage(casualCtx(projects, { raw: "1" }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/no project access|casual/);
  });

  it("status still works for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "status" }));
    expect(result.handled).toBe(true);
    expect(result.reply).toBeDefined();
  });

  it("stop still works for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, {
      raw: "stop",
      getRunStatus: () => busyStatus(),
      stopCurrent: () => true,
    }));
    expect(result.handled).toBe(true);
    expect(result.reply!.toLowerCase()).toMatch(/stop/);
  });

  it("new chat still works for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const conversations = { setChatId: () => {} } as any;
    projects.setCurrent("crm");
    const result = handleUserMessage(casualCtx(projects, { raw: "new chat", conversations }));
    expect(result.handled).toBe(true);
    expect(result.reply).toBeDefined();
  });

  it("casual new chat clears the namespaced session key, not the owner project key", () => {
    const root = mkdtempSync(join(tmpdir(), "cwa-casual-newchat-"));
    const generalDir = join(root, "general");
    mkdirSync(generalDir, { recursive: true });
    const projects = new ProjectStore(
      testConfig({
        defaultProject: "crm",
        casualNumbers: ["923001234567"],
        generalDir,
        historyDir: join(root, "history"),
      })
    );
    const conversations = new ConversationManager(join(root, "history"));
    conversations.setChatId("crm", "owner-sess");
    conversations.setChatId("general__wa:923001234567", "casual-sess");

    const result = handleUserMessage(
      casualCtx(projects, {
        raw: "new chat",
        conversationKey: "wa:923001234567",
        conversations,
      })
    );

    expect(result.handled).toBe(true);
    expect(conversations.getChatId("general__wa:923001234567")).toBeNull();
    expect(conversations.getChatId("crm")).toBe("owner-sess");
    expect(result.reply!).toMatch(/GENERAL/i);
    expect(result.reply!).toMatch(/clean slate|fresh|new chat/i);
  });

  it("normal prompt passes through for casual access", () => {
    const projects = new ProjectStore(testConfig({ defaultProject: "crm", casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "refactor auth" }));
    expect(result.handled).toBe(false);
    expect(result.passToAgent).toBe(true);
  });

  it("current says GENERAL for casual access", () => {
    const projects = new ProjectStore(testConfig({ casualNumbers: [], generalDir: join(tmpdir(), "general") }));
    const result = handleUserMessage(casualCtx(projects, { raw: "current" }));
    expect(result.handled).toBe(true);
    expect(result.reply!).toMatch(/GENERAL/);
  });

  it("owner access retains existing help with project picker (regression)", () => {
    const projects = new ProjectStore(testConfig());
    const result = handleUserMessage(baseCtx(projects, { raw: "help" }));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/1\.\s/);
    expect(result.reply).toMatch(/CRM/i);
  });
});

describe("handleUserMessage", () => {
  it("passes normal prompts to the agent when a project is set", () => {
    const projects = new ProjectStore(testConfig({ defaultProject: "crm" }));
    const result = handleUserMessage(baseCtx(projects, { raw: "Refactor auth" }));
    expect(result.handled).toBe(false);
    expect(result.passToAgent).toBe(true);
  });

  it("lists projects conversationally", () => {
    const projects = new ProjectStore(testConfig());
    const result = handleUserMessage(baseCtx(projects, { raw: "projects" }));
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/1\.\s*CRM/i);
    expect(result.reply).toMatch(/2\.\s*FLEET/i);
  });

  it("switches project by name", () => {
    const projects = new ProjectStore(testConfig());
    const result = handleUserMessage(baseCtx(projects, { raw: "switch to crm" }));
    expect(result.reply).toMatch(/CRM/i);
    expect(projects.getCurrent()?.key).toBe("crm");
  });

  it("rejects unknown project names when switching", () => {
    const projects = new ProjectStore(testConfig());
    const result = handleUserMessage(baseCtx(projects, { raw: "switch to missing" }));
    expect(result.reply).toMatch(/don't have a project/i);
    expect(result.reply).toMatch(/CRM/i);
  });

  it("stops a busy cursor with plain language", () => {
    let stopped = false;
    const projects = new ProjectStore(testConfig({ defaultProject: "crm" }));
    const result = handleUserMessage(baseCtx(projects, {
      raw: "stop",
      getRunStatus: () => busyStatus(),
      stopCurrent: () => {
        stopped = true;
        return true;
      },
    }));
    expect(stopped).toBe(true);
    expect(result.reply).toMatch(/stopping/i);
  });

  it("stop all clears the queue and stops all runs", () => {
    let stopAllCalled = false;
    let clearCalled = false;
    const projects = new ProjectStore(testConfig({ defaultProject: "crm" }));
    const result = handleUserMessage(baseCtx(projects, {
      raw: "stop all",
      getRunStatus: () => busyStatus(),
      stopAllRuns: () => {
        stopAllCalled = true;
      },
      clearAllQueues: () => {
        clearCalled = true;
        return 2;
      },
    }));
    expect(stopAllCalled).toBe(true);
    expect(clearCalled).toBe(true);
    expect(result.reply).toMatch(/stopping|clear/i);
  });

  it("multi-agent status shows multiple projects", () => {
    const projects = new ProjectStore(testConfig({ defaultProject: "crm" }));
    const result = handleUserMessage(baseCtx(projects, {
      raw: "status",
      getRunStatus: () => ({
        busy: [
          { workspace: "/a", projectKey: "crm" },
          { workspace: "/b", projectKey: "fleet" },
        ],
        queuedCount: 0,
        queueDepths: [],
      }),
    }));
    expect(result.reply).toMatch(/2 agents running/i);
    expect(result.reply).toMatch(/CRM/i);
    expect(result.reply).toMatch(/FLEET/i);
  });
});
