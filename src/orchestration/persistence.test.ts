import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "../projects/index.js";

function makeConfig(root: string): AppConfig {
  return {
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
}

describe("ProjectStore agentMode persistence", () => {
  it("defaults to orchestrate when state has no agentMode", () => {
    const root = mkdtempSync(join(tmpdir(), "cwa-mode-"));
    mkdirSync(join(root, "crm"));
    writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: join(root, "crm") }));
    writeFileSync(
      join(root, "state.json"),
      JSON.stringify({ currentProject: "crm", awaitingProjectPick: false })
    );

    const store = new ProjectStore(makeConfig(root));
    expect(store.getAgentMode()).toBe("orchestrate");
  });

  it("persists solo and reloads it", () => {
    const root = mkdtempSync(join(tmpdir(), "cwa-mode-"));
    mkdirSync(join(root, "crm"));
    writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: join(root, "crm") }));

    const store = new ProjectStore(makeConfig(root));
    store.setAgentMode("solo");
    expect(store.getAgentMode()).toBe("solo");

    const saved = JSON.parse(readFileSync(join(root, "state.json"), "utf8")) as {
      agentMode?: string;
    };
    expect(saved.agentMode).toBe("solo");

    const reloaded = new ProjectStore(makeConfig(root));
    expect(reloaded.getAgentMode()).toBe("solo");
  });
});
