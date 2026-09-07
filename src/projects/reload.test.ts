import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ProjectStore } from "./index.js";

function setup(): { store: ProjectStore; projectsFile: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "cwa-reload-"));
  const crm = join(root, "crm");
  mkdirSync(crm);
  const projectsFile = join(root, "projects.json");
  writeFileSync(projectsFile, JSON.stringify({ crm }));
  const config: AppConfig = {
    rootDir: root,
    projectsFile,
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
  return { store: new ProjectStore(config), projectsFile, root };
}

describe("ProjectStore live reload", () => {
  it("picks up new projects when the picker is rendered", () => {
    const { store, projectsFile, root } = setup();
    const fleet = join(root, "fleet");
    mkdirSync(fleet);
    writeFileSync(projectsFile, JSON.stringify({ crm: join(root, "crm"), fleet }));

    const picker = store.formatPicker();
    expect(picker).toMatch(/FLEET/i);
  });

  it("picks up new projects on switch attempt", () => {
    const { store, projectsFile, root } = setup();
    const fleet = join(root, "fleet");
    mkdirSync(fleet);
    writeFileSync(projectsFile, JSON.stringify({ crm: join(root, "crm"), fleet }));

    const set = store.setCurrent("fleet");
    expect(set?.key).toBe("fleet");
  });
});
