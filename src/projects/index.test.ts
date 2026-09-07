import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "./index.js";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "cwa-proj-"));
  const projectsFile = join(root, "projects.json");
  writeFileSync(projectsFile, JSON.stringify({ crm: join(root, "crm") }));
  return {
    rootDir: root,
    projectsFile,
    historyDir: join(root, "history"),
    logsDir: join(root, "logs"),
    authDir: join(root, "auth_info"),
    stateFile: join(root, "state.json"),
    cursorBin: "cursor",
    allowedNumbers: [],
    casualNumbers: [],
    generalDir: join(root, "general"),
    defaultProject: null,
    maxWhatsAppChars: 4000,
    appName: "CursorWA",
    cursorTimeoutMin: 15,
    openaiApiKey: null,
    retentionDays: 7,
    ...overrides,
  } as AppConfig;
}

describe("ProjectStore: general project (Slice B)", () => {
  it("includes 'general' in list() after construction", () => {
    const store = new ProjectStore(testConfig());
    expect(store.list()).toContain("general");
  });

  it("get('general') returns the generalDir path", () => {
    const cfg = testConfig();
    const store = new ProjectStore(cfg);
    expect(store.get("general")).toBe((cfg as any).generalDir);
  });

  it("creates generalDir on reload when it does not exist", () => {
    const cfg = testConfig();
    const generalDir = (cfg as any).generalDir as string;
    expect(existsSync(generalDir)).toBe(false);
    new ProjectStore(cfg);
    expect(existsSync(generalDir)).toBe(true);
  });

  it("aliases in projects.json override the default general path", () => {
    const cfg = testConfig();
    const root = cfg.rootDir;
    const customPath = join(root, "custom-general");
    writeFileSync(
      cfg.projectsFile,
      JSON.stringify({ crm: join(root, "crm"), general: customPath }),
    );
    const store = new ProjectStore(cfg);
    expect(store.get("general")).toBe(customPath);
  });

  it("general appears alongside other projects (sorted)", () => {
    const cfg = testConfig();
    const root = cfg.rootDir;
    writeFileSync(
      cfg.projectsFile,
      JSON.stringify({ crm: join(root, "crm"), fleet: join(root, "fleet") }),
    );
    const store = new ProjectStore(cfg);
    expect(store.list()).toEqual(["crm", "fleet", "general"]);
  });
});
