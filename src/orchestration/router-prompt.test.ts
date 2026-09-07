import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { ConversationManager } from "../conversation/index.js";
import type { CursorRunOptions, CursorRunResult } from "../cursor/runner.js";
import { MessageRouter } from "../commands/router.js";

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

function setupRouter(): { router: MessageRouter; workspace: string } {
  const root = mkdtempSync(join(tmpdir(), "cwa-orch-router-"));
  const workspace = join(root, "crm");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: workspace }));
  const config = makeConfig(root);
  const router = new MessageRouter(config);
  router.conversations = new ConversationManager(config.historyDir);
  return { router, workspace };
}

describe("MessageRouter orchestration prompt wrapping", () => {
  it("wraps prompts in orchestrate mode before calling Cursor", async () => {
    const { router, workspace } = setupRouter();

    const run = vi.fn(async (_opts: CursorRunOptions): Promise<CursorRunResult> => ({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: "c1",
      cancelled: false,
      timedOut: false,
      usage: null,
    }));
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(run);

    const replies: string[] = [];
    await router.handle("Add mode persistence", async (text) => {
      replies.push(text);
    });

    expect(run).toHaveBeenCalledOnce();
    const prompt = run.mock.calls[0]![0]!.prompt;
    expect(prompt).toContain("Add mode persistence");
    expect(prompt).toMatch(/Task tool/i);
    expect(prompt).toMatch(/tester/i);
  });

  it("does not wrap prompts in solo mode", async () => {
    const { router, workspace } = setupRouter();
    router.projects.setAgentMode("solo");

    const run = vi.fn(async (_opts: CursorRunOptions): Promise<CursorRunResult> => ({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: "c1",
      cancelled: false,
      timedOut: false,
      usage: null,
    }));
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(run);

    await router.handle("Add mode persistence", async () => {});

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.prompt).toBe("Add mode persistence");
  });
});
