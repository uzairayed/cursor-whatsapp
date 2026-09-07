import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/index.js";
import { MessageRouter } from "./router.js";

function setup(): { config: AppConfig; workspace: string; generalWorkspace: string } {
  const root = mkdtempSync(join(tmpdir(), "cwa-router-"));
  const workspace = join(root, "crm");
  const generalWorkspace = join(root, "general");
  mkdirSync(workspace);
  mkdirSync(generalWorkspace);
  writeFileSync(
    join(root, "projects.json"),
    JSON.stringify({ crm: workspace })
  );
  return {
    workspace,
    generalWorkspace,
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
      generalDir: generalWorkspace,
      defaultProject: "crm",
      maxWhatsAppChars: 50,
      appName: "CursorWA",
      cursorTimeoutMin: 15,
      openaiApiKey: null,
      retentionDays: 7,
    },
  };
}

describe("MessageRouter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains unknown project names in plain language", async () => {
    const { config } = setup();
    const router = new MessageRouter(config);
    const replies: string[] = [];
    await router.handle("switch to nope", async (t) => {
      replies.push(t);
    });
    expect(replies[0]).toMatch(/don't have a project/i);
  });

  it("queues prompts when workspace is busy", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    router.runners.markRunning(workspace, "crm");

    const replies: string[] = [];
    await router.handle("do something", async (t) => {
      replies.push(t);
    });
    expect(replies[0]).toMatch(/queued/i);
    expect(replies[0]).toMatch(/1 task ahead/i);
  });

  it("drains the queue after a run finishes", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const prompts: string[] = [];

    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockImplementation(async (opts) => {
      prompts.push(opts.prompt);
      return {
        stdout: `done:${opts.prompt}`,
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      };
    });

    // Mark busy so first prompt queues
    router.runners.markRunning(workspace, "crm");
    const replies: string[] = [];
    const reply = async (t: string) => {
      replies.push(t);
    };

    await router.handle("queued-one", reply);
    expect(replies[0]).toMatch(/queued/i);

    // Release the slot so next handle runs + drains
    router.runners.markIdle(workspace);
    await router.handle("first-run", reply);

    expect(prompts.some((p) => p.includes("first-run"))).toBe(true);
    expect(prompts.some((p) => p.includes("queued-one"))).toBe(true);
    const firstIdx = prompts.findIndex((p) => p.includes("first-run"));
    const queuedIdx = prompts.findIndex((p) => p.includes("queued-one"));
    expect(firstIdx).toBeLessThan(queuedIdx);
  });

  it("runs cursor and splits long replies", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);

    vi.spyOn(runner, "run").mockResolvedValue({
      stdout: "x".repeat(120),
      stderr: "",
      exitCode: 0,
      durationSec: 1,
      chatId: "sess-1",
      cancelled: false,
      timedOut: false,
      usage: {
        inputTokens: 17472,
        outputTokens: 12,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });

    const replies: string[] = [];
    await router.handle("refactor auth", async (t) => {
      replies.push(t);
    });

    expect(replies[0]).toMatch(/CRM/);
    expect(replies[0]).toMatch(/on it|working/i);
    expect(replies.length).toBeGreaterThan(2);
    const body = replies.slice(1).join("");
    expect(body).toContain("x".repeat(120));
    expect(body).toMatch(/~17k tokens/i);
    expect(router.conversations.getChatId("crm")).toBe("sess-1");
  });

  it("reports Cursor CLI not found", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const { CursorNotFoundError } = await import("../cursor/runner.js");
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockRejectedValue(new CursorNotFoundError("cursor"));

    const replies: string[] = [];
    await router.handle("refactor the auth middleware", async (t) => {
      replies.push(t);
    });
    expect(replies.at(-1)).toBe("Cursor CLI not found.");
  });

  it("tells the user when a run times out", async () => {
    const { config, workspace } = setup();
    const router = new MessageRouter(config);
    const runner = router.runners.getRunnerFor(workspace);
    vi.spyOn(runner, "run").mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      durationSec: 900,
      chatId: null,
      cancelled: true,
      timedOut: true,
      usage: null,
    });

    const replies: string[] = [];
    await router.handle("big refactor", async (t) => {
      replies.push(t);
    });
    expect(replies.at(-1)).toMatch(/took too long/i);
  });

  describe("casual routing", () => {
    it("casual handle resolves to general workspace", async () => {
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      const runner = router.runners.getRunnerFor(generalWorkspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      await router.handle("hello world", async () => {}, {
        access: "casual",
        conversationKey: "wa:923001234567",
      });

      expect(runSpy).toHaveBeenCalled();
      expect(runSpy.mock.calls[0][0].workspace).toBe(generalWorkspace);
    });

    it("casual handle uses sessionKey from conversationKey", async () => {
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      const runner = router.runners.getRunnerFor(generalWorkspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      await router.handle("fix a bug", async () => {}, {
        access: "casual",
        conversationKey: "wa:923001234567",
      });

      expect(runSpy).toHaveBeenCalled();
      expect(runSpy.mock.calls[0][0].sessionKey).toBe(
        "general__wa:923001234567"
      );
    });

    it("casual handle does not mutate currentProject", async () => {
      const { config, workspace, generalWorkspace } = setup();
      const router = new MessageRouter(config);

      // Set current project to crm
      router.projects.setCurrent("crm");
      expect(router.projects.getCurrent()?.key).toBe("crm");

      const runner = router.runners.getRunnerFor(generalWorkspace);
      vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      await router.handle("do something", async () => {}, {
        access: "casual",
        conversationKey: "wa:923001234567",
      });

      expect(router.projects.getCurrent()?.key).toBe("crm");
    });

    it("casual command blocking works through router", async () => {
      const { config } = setup();
      const router = new MessageRouter(config);

      const replies: string[] = [];
      await router.handle("projects", async (t) => {
        replies.push(t);
      }, { access: "casual" });

      expect(
        replies.some((r) => /casual|no project access/i.test(r))
      ).toBe(true);
    });

    it("casual go implements pending plan against general without requiring owner currentProject", async () => {
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      router.projects.setCurrent("crm");
      router.projects.setPendingPlan({
        projectKey: "general",
        userPrompt: "big task",
        planText: "1. Do thing",
      });

      const runner = router.runners.getRunnerFor(generalWorkspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "implemented",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      const replies: string[] = [];
      await router.handle("go", async (t) => {
        replies.push(t);
      }, { access: "casual", conversationKey: "wa:92300" });

      expect(runSpy).toHaveBeenCalled();
      expect(runSpy.mock.calls[0][0].workspace).toBe(generalWorkspace);
      expect(router.projects.getPendingPlan()).toBeNull();
      expect(replies.some((r) => /switch back/i.test(r))).toBe(false);
    });

    it("dequeued casual prompt carries sessionKey (queue path preserves per-sender isolation)", async () => {
      // RED: QueuedRunOptions has no sessionKey field — dequeued runs lose the
      // namespaced key and fall back to bare "general".
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      const runner = router.runners.getRunnerFor(generalWorkspace);

      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      // Simulate general/ being busy so the first casual prompt is queued.
      router.runners.markRunning(generalWorkspace, "general");

      const reply = async (_t: string) => {};
      // Phone A sends a prompt while general is busy — it gets queued.
      await router.handle("task from phone A", reply, {
        access: "casual",
        conversationKey: "wa:111000000001",
      });

      // Release the slot so the next handle runs and drains the queue.
      router.runners.markIdle(generalWorkspace);

      // Phone B sends a prompt — this runs immediately and drainAfterRun
      // picks up Phone A's queued item.
      await router.handle("task from phone B", reply, {
        access: "casual",
        conversationKey: "wa:222000000002",
      });

      // Find the runner.run call for Phone A's queued task (by prompt text).
      const phoneACall = runSpy.mock.calls.find((c) =>
        c[0].prompt.includes("task from phone A")
      );
      expect(phoneACall, "runner.run was never called for the queued Phone A prompt").toBeDefined();
      expect(phoneACall![0].sessionKey).toBe("general__wa:111000000001");
    });

    it("two casual phones never share bare 'general' storage key via queue", async () => {
      // RED: both queued items must use namespaced keys, not the bare "general".
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      const runner = router.runners.getRunnerFor(generalWorkspace);

      const capturedSessionKeys: Array<{ prompt: string; sessionKey: string | undefined }> = [];
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedSessionKeys.push({ prompt: opts.prompt, sessionKey: opts.sessionKey });
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      // Both phones queue while general is busy.
      router.runners.markRunning(generalWorkspace, "general");
      const reply = async (_t: string) => {};

      await router.handle("phone1 task", reply, {
        access: "casual",
        conversationKey: "wa:111111111111",
      });
      await router.handle("phone2 task", reply, {
        access: "casual",
        conversationKey: "wa:222222222222",
      });

      // Release and drain via a third handle.
      router.runners.markIdle(generalWorkspace);
      await router.handle("phone3 trigger", reply, {
        access: "casual",
        conversationKey: "wa:333333333333",
      });

      // Every run must use a namespaced key — never the bare "general".
      for (const entry of capturedSessionKeys) {
        expect(
          entry.sessionKey,
          `run for "${entry.prompt}" used bare "general" instead of a namespaced key`
        ).not.toBe("general");
        expect(
          entry.sessionKey,
          `run for "${entry.prompt}" is missing sessionKey entirely`
        ).toBeDefined();
      }
    });

    it("casual ask queued while general busy — dequeued run carries namespaced sessionKey", async () => {
      // RED: tryQueue for the ask-branch is called without sessionKey in runOpts,
      // so the dequeued item runs with sessionKey === undefined instead of the
      // namespaced "general__wa:<phone>" key.
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      const runner = router.runners.getRunnerFor(generalWorkspace);

      const capturedCalls: Array<{ prompt: string; sessionKey: string | undefined }> = [];
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedCalls.push({ prompt: opts.prompt, sessionKey: opts.sessionKey });
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      // Simulate general/ being busy so the ask prompt is queued.
      router.runners.markRunning(generalWorkspace, "general");
      const reply = async (_t: string) => {};

      await router.handle("ask what is the meaning of life", reply, {
        access: "casual",
        conversationKey: "wa:923001111111",
      });

      // Release the slot so the queued ask drains on the next handle.
      router.runners.markIdle(generalWorkspace);

      await router.handle("ping", reply, {
        access: "casual",
        conversationKey: "wa:923009999999",
      });

      // The queued ask item must have been executed with the sender's namespaced key.
      const askCall = capturedCalls.find((c) =>
        c.prompt.toLowerCase().includes("meaning of life")
      );
      expect(askCall, "runner.run was never called for the queued ask prompt").toBeDefined();
      expect(askCall!.sessionKey).toBe("general__wa:923001111111");
    });

    it("casual plan-approve queued while general busy — dequeued run carries namespaced sessionKey", async () => {
      // RED: tryQueue for the plan-approve casual branch is called without
      // sessionKey in runOpts, so the dequeued item runs with sessionKey ===
      // undefined instead of the namespaced "general__wa:<phone>" key.
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);

      // Set up a pending plan for the general project.
      router.projects.setPendingPlan({
        projectKey: "general",
        userPrompt: "build the thing",
        planText: "1. Step A\n2. Step B",
      });

      const runner = router.runners.getRunnerFor(generalWorkspace);
      const capturedCalls: Array<{ prompt: string; sessionKey: string | undefined }> = [];
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedCalls.push({ prompt: opts.prompt, sessionKey: opts.sessionKey });
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      // Simulate general/ being busy so the plan-approve is queued.
      router.runners.markRunning(generalWorkspace, "general");
      const reply = async (_t: string) => {};

      await router.handle("go", reply, {
        access: "casual",
        conversationKey: "wa:923002222222",
      });

      // Release the slot so the queued approval drains on the next handle.
      router.runners.markIdle(generalWorkspace);

      await router.handle("ping", reply, {
        access: "casual",
        conversationKey: "wa:923009999999",
      });

      // Two runs should have occurred: "ping" (direct) then "go" (dequeued drain).
      expect(capturedCalls.length).toBeGreaterThanOrEqual(2);
      // The dequeued approve is the last run (drained after "ping" finishes).
      const approveCall = capturedCalls[capturedCalls.length - 1];
      expect(
        approveCall.prompt,
        "last run should be the dequeued plan-approve, not ping"
      ).not.toMatch(/\bping\b/i);
      expect(approveCall.sessionKey).toBe("general__wa:923002222222");
    });

    it("casual prompt uses solo wrap even when global agent mode is orchestrate", async () => {
      // Criterion: Casual / general prompts use the general-chat preamble
      // (not raw solo, not the orchestrate TDD preamble), even when global
      // agent mode is orchestrate.
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);

      // Set global mode to orchestrate — the bug surfaces only when this is set.
      router.projects.setAgentMode("orchestrate");
      expect(router.projects.getAgentMode()).toBe("orchestrate");

      const runner = router.runners.getRunnerFor(generalWorkspace);
      let capturedPrompt = "";
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedPrompt = opts.prompt;
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      const userMessage = "explain quantum computing in simple terms";
      await router.handle(userMessage, async () => {}, {
        access: "casual",
        conversationKey: "wa:923001234567",
      });

      expect(capturedPrompt).toContain(userMessage);
      expect(capturedPrompt).toMatch(/general[- ]purpose|whatsapp/i);
      expect(capturedPrompt).not.toMatch(/orchestrator agent|Task tool|red\s*→\s*green/i);
    });

    it("casual prompt queued while general busy uses solo wrap on drain (no orchestration preamble via queue path)", async () => {
      // Criterion: drained casual prompts also get the general-chat preamble,
      // never the orchestrate TDD preamble.
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);

      // Set global mode to orchestrate — the bug surfaces only when this is set.
      router.projects.setAgentMode("orchestrate");

      const runner = router.runners.getRunnerFor(generalWorkspace);
      const capturedPrompts: string[] = [];
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedPrompts.push(opts.prompt);
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      // Simulate general/ being busy so the casual prompt is queued.
      router.runners.markRunning(generalWorkspace, "general");

      const userMessage = "explain quantum computing in simple terms";
      const reply = async (_t: string) => {};

      await router.handle(userMessage, reply, {
        access: "casual",
        conversationKey: "wa:923001234567",
      });

      // Release the slot so the queued item drains on the next handle.
      router.runners.markIdle(generalWorkspace);

      await router.handle("ping", reply, {
        access: "casual",
        conversationKey: "wa:923009999999",
      });

      // Find the runner.run call for the originally queued casual message.
      const casualRunPrompt = capturedPrompts.find((p) => p.includes(userMessage));
      expect(
        casualRunPrompt,
        "runner.run was never called for the queued casual prompt"
      ).toBeDefined();

      expect(casualRunPrompt).toContain(userMessage);
      expect(casualRunPrompt).toMatch(/general[- ]purpose|whatsapp/i);
      expect(casualRunPrompt).not.toMatch(/orchestrator agent|Task tool|red\s*→\s*green/i);
    });

    it("owner on project general gets general-chat preamble even when agentMode is orchestrate", async () => {
      // Criterion: Owner current project `general` uses general-chat preamble,
      // never the orchestrate TDD preamble.
      const { config, generalWorkspace } = setup();
      const router = new MessageRouter(config);
      router.projects.setCurrent("general");
      router.projects.setAgentMode("orchestrate");
      expect(router.projects.getAgentMode()).toBe("orchestrate");

      const runner = router.runners.getRunnerFor(generalWorkspace);
      let capturedPrompt = "";
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedPrompt = opts.prompt;
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      const userMessage = "what's a good dinner idea";
      await router.handle(userMessage, async () => {}, { access: "owner" });

      expect(capturedPrompt).toContain(userMessage);
      expect(capturedPrompt).toMatch(/general[- ]purpose|whatsapp/i);
      expect(capturedPrompt).not.toMatch(/orchestrator agent|Task tool|red\s*→\s*green/i);
    });

    it("owner prompt uses orchestrate wrap when global agent mode is orchestrate", async () => {
      // Paired assertion: owners on real projects must still receive the
      // orchestration preamble when their global mode is orchestrate.
      const { config, workspace } = setup();
      const router = new MessageRouter(config);
      router.projects.setCurrent("crm");

      // Set global mode to orchestrate.
      router.projects.setAgentMode("orchestrate");

      const runner = router.runners.getRunnerFor(workspace);
      let capturedPrompt = "";
      vi.spyOn(runner, "run").mockImplementation(async (opts) => {
        capturedPrompt = opts.prompt;
        return {
          stdout: "done",
          stderr: "",
          exitCode: 0,
          durationSec: 1,
          chatId: null,
          cancelled: false,
          timedOut: false,
          usage: null,
        };
      });

      await router.handle("refactor auth", async () => {}, { access: "owner" });

      // Owner should get the orchestration preamble.
      expect(capturedPrompt).toMatch(/orchestrator agent/i);
      expect(capturedPrompt).toMatch(/Task tool/i);
      expect(capturedPrompt).toContain("refactor auth");
    });

    it("owner access unchanged — uses current project", async () => {
      const { config, workspace } = setup();
      const router = new MessageRouter(config);
      router.projects.setCurrent("crm");

      const runner = router.runners.getRunnerFor(workspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: null,
        cancelled: false,
        timedOut: false,
        usage: null,
      });

      await router.handle("do work", async () => {}, { access: "owner" });

      expect(runSpy).toHaveBeenCalled();
      expect(runSpy.mock.calls[0][0].workspace).toBe(workspace);
    });
  });

  // AC#4 – smart history rotation
  describe("auto-fresh on heavy context", () => {
    it("clears chatId and uses resume=false when stored lastInputTokens >= 80k", async () => {
      const { config, workspace } = setup();
      const router = new MessageRouter(config);

      // Seed the conversation with a heavy previous turn
      router.projects.setCurrent("crm");
      router.conversations.append("crm", "prev prompt", "prev reply", "old-chat-id", {
        inputTokens: 80_000,
      });

      const runner = router.runners.getRunnerFor(workspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "fresh response",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: "new-chat-id",
        cancelled: false,
        timedOut: false,
        usage: { inputTokens: 5_000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });

      const replies: string[] = [];
      await router.handle("do more work", async (t) => { replies.push(t); });

      // resume must be false — the old chatId must NOT be passed to --resume
      expect(runSpy).toHaveBeenCalled();
      const callOpts = runSpy.mock.calls[0][0];
      expect(callOpts.resume).toBe(false);

      // The stored chatId under the project key must have been cleared before the run
      // (or at the moment of the run); the final stored id is the new one from this run
      const allReplies = replies.join("\n");
      expect(allReplies).toMatch(/reset|fresh|new chat/i);
    });

    it("does NOT auto-fresh when lastInputTokens < 80k", async () => {
      const { config, workspace } = setup();
      const router = new MessageRouter(config);

      router.projects.setCurrent("crm");
      router.conversations.append("crm", "prev prompt", "prev reply", "old-chat-id", {
        inputTokens: 79_999,
      });

      const runner = router.runners.getRunnerFor(workspace);
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({
        stdout: "response",
        stderr: "",
        exitCode: 0,
        durationSec: 1,
        chatId: "old-chat-id",
        cancelled: false,
        timedOut: false,
        usage: { inputTokens: 50_000, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });

      await router.handle("next task", async () => {});

      expect(runSpy).toHaveBeenCalled();
      const callOpts = runSpy.mock.calls[0][0];
      // resume should NOT be forced false; it will default to true for non-plan runs
      expect(callOpts.resume).not.toBe(false);
    });
  });
});
