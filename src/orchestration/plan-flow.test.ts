import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { handleUserMessage, type CommandContext } from "../commands/index.js";
import { MessageRouter } from "../commands/router.js";
import { ConversationManager } from "../conversation/index.js";
import type { CursorRunOptions, CursorRunResult } from "../cursor/runner.js";
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

function setupRoot(): { root: string; workspace: string; config: AppConfig } {
  const root = mkdtempSync(join(tmpdir(), "cwa-plan-flow-"));
  const workspace = join(root, "crm");
  mkdirSync(workspace);
  writeFileSync(join(root, "projects.json"), JSON.stringify({ crm: workspace }));
  return { root, workspace, config: makeConfig(root) };
}

const largePrompt = [
  "Priority list from testing:",
  "1. Vipps payments are only reserved, not captured.",
  "2. Fix the webhook timeout on capture.",
  "3. Add retries for failed captures.",
  "4. Notify ops when capture fails twice.",
].join("\n");

describe("plan-first router flow", () => {
  it("runs large prompts in plan mode and stores a pending plan", async () => {
    const { config, workspace } = setupRoot();
    const router = new MessageRouter(config);
    router.conversations = new ConversationManager(config.historyDir);

    const run = vi.fn(async (opts: CursorRunOptions): Promise<CursorRunResult> => ({
      stdout: [
        "**Goal** Capture Vipps after authorize",
        "**Slices**",
        "1. Failing test for capture",
        "2. Implement capture",
        "**Risks** Double-capture",
        "**Out of scope** Email redesign",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationSec: 2,
      chatId: "c1",
      cancelled: false,
      timedOut: false,
      usage: null,
    }));
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(run);

    const replies: string[] = [];
    await router.handle(largePrompt, async (text) => {
      replies.push(text);
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.executionMode).toBe("ask");
    expect(run.mock.calls[0]![0]!.resume).toBe(false);
    expect(run.mock.calls[0]![0]!.prompt).toMatch(/read-only|do not edit/i);
    expect(run.mock.calls[0]![0]!.prompt).toMatch(/final message/i);
    expect(router.projects.getPendingPlan()?.userPrompt).toBe(largePrompt);
    expect(replies.some((r) => /\*go\*/i.test(r))).toBe(true);
    expect(replies.some((r) => /Capture Vipps/i.test(r))).toBe(true);
  });

  it("retries once when the first plan reply is only a status stub", async () => {
    const { config, workspace } = setupRoot();
    const router = new MessageRouter(config);
    router.conversations = new ConversationManager(config.historyDir);

    const fullPlan = [
      "**Goal** Fix hero CTA",
      "**Slices** 1. Test 2. Implement",
      "**Risks** Layout",
      "**Out of scope** Ads",
    ].join("\n");

    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout:
          "I'll review the homepage, then draft one concise WhatsApp-ready plan covering all four items.",
        stderr: "",
        exitCode: 0,
        durationSec: 2,
        chatId: "c1",
        cancelled: false,
        timedOut: false,
        usage: null,
      } satisfies CursorRunResult)
      .mockResolvedValueOnce({
        stdout: fullPlan,
        stderr: "",
        exitCode: 0,
        durationSec: 2,
        chatId: "c1",
        cancelled: false,
        timedOut: false,
        usage: null,
      } satisfies CursorRunResult);

    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(run);

    const replies: string[] = [];
    await router.handle(largePrompt, async (text) => {
      replies.push(text);
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![0]!.prompt).toMatch(/complete WhatsApp plan NOW/i);
    expect(run.mock.calls[1]![0]!.resume).toBe(true);
    expect(replies.some((r) => /Fix hero CTA/i.test(r))).toBe(true);
  });

  it("go runs an agent implement pass from the pending plan", async () => {
    const { config, workspace } = setupRoot();
    const router = new MessageRouter(config);
    router.conversations = new ConversationManager(config.historyDir);
    router.conversations.setChatId("crm", "ask-session-from-plan");
    router.projects.setPendingPlan({
      projectKey: "crm",
      userPrompt: largePrompt,
      planText: "1. Capture Vipps",
    });

    const run = vi.fn(async (opts: CursorRunOptions): Promise<CursorRunResult> => ({
      stdout: "implemented",
      stderr: "",
      exitCode: 0,
      durationSec: 2,
      chatId: "c1",
      cancelled: false,
      timedOut: false,
      usage: null,
    }));
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(run);

    await router.handle("go", async () => {});

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]!.resume).toBe(false);
    expect(run.mock.calls[0]![0]!.executionMode ?? "agent").toBe("agent");
    expect(run.mock.calls[0]![0]!.prompt).toMatch(/approved plan/i);
    expect(run.mock.calls[0]![0]!.prompt).toContain("Capture Vipps");
    expect(router.projects.getPendingPlan()).toBeNull();
  });
});

describe("plan approval commands", () => {
  it("cancel plan clears pending state", () => {
    const { config } = setupRoot();
    const projects = new ProjectStore(config);
    projects.setPendingPlan({
      projectKey: "crm",
      userPrompt: largePrompt,
      planText: "steps",
    });
    const result = handleUserMessage({
      projects,
      raw: "cancel plan",
      getRunStatus: () => ({ busy: [], queuedCount: 0, queueDepths: [] }),
      stopCurrent: () => false,
      stopAllRuns: () => {},
      clearCurrentQueue: () => 0,
      clearAllQueues: () => 0,
    });
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/cleared|cancelled/i);
    expect(projects.getPendingPlan()).toBeNull();
  });
});
