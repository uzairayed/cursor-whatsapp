import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { MessageRouter } from "./router.js";

function setup(): { config: AppConfig; workspace: string } {
  const root = mkdtempSync(join(tmpdir(), "ask-mode-"));
  const workspace = join(root, "crm");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: workspace }));
  return {
    workspace,
    config: {
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
      defaultProject: "crm",
      maxWhatsAppChars: 4000,
      appName: "CursorWA",
      cursorTimeoutMin: 15,
      openaiApiKey: null,
      retentionDays: 7,
    },
  };
}

describe("MessageRouter ask mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('"ask <q>" runs with executionMode ask and skips plan-first', async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);
    const run = vi.spyOn(runner, "run").mockImplementation(async (opts) => ({
      stdout: "It's a React app.",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: null,
      cancelled: false,
      timedOut: false,
      usage: null,
    }));

    const replies: string[] = [];
    await router.handle("ask what stack is this?", async (t) => {
      replies.push(t);
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.executionMode).toBe("ask");
    expect(replies.some((r) => /React app/i.test(r))).toBe(true);
  });

  it('"/ask <q>" works the same as bare ask', async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);
    const run = vi.spyOn(runner, "run").mockImplementation(async () => ({
      stdout: "It uses Express.",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: null,
      cancelled: false,
      timedOut: false,
      usage: null,
    }));

    const replies: string[] = [];
    await router.handle("/ask what framework?", async (t) => {
      replies.push(t);
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.executionMode).toBe("ask");
  });

  it("ask mode working reply mentions ask mode", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(async () => ({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: null,
      cancelled: false,
      timedOut: false,
      usage: null,
    }));

    const replies: string[] = [];
    await router.handle("ask anything?", async (t) => {
      replies.push(t);
    });

    expect(replies[0]).toMatch(/ask mode/i);
  });

  it("ask mode skips plan-first even for large prompts", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const longPrompt = "ask " + "x".repeat(500);
    const runner = router.runners.getRunnerFor(workspace);
    const run = vi.spyOn(runner, "run").mockImplementation(async () => ({
      stdout: "answer",
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: null,
      cancelled: false,
      timedOut: false,
      usage: null,
    }));

    const replies: string[] = [];
    await router.handle(longPrompt, async (t) => {
      replies.push(t);
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.executionMode).toBe("ask");
    expect(replies.some((r) => /answer/i.test(r))).toBe(true);
  });

  it("help text documents ask mode", async () => {
    const { config } = setup();
    const router = new MessageRouter(config);

    const replies: string[] = [];
    await router.handle("help", async (t) => {
      replies.push(t);
    });

    expect(replies[0]).toMatch(/ask/i);
  });
});
