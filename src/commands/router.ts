import type { AppConfig } from "../config/index.js";
import { ConversationManager } from "../conversation/index.js";
import {
  CursorBusyError,
  CursorNotFoundError,
  type CursorExecutionMode,
} from "../cursor/runner.js";
import { CursorRunnerPool } from "../cursor/runner-pool.js";
import { sessionStorageKey } from "../cursor/session-key.js";
import { createLiveProgressReporter } from "../cursor/stream-progress.js";
import { buildIssueDraft } from "../github/issue-draft.js";
import { parseIssueIntent } from "../github/issue-intent.js";
import { GitHubIssueError, GitHubIssues } from "../github/issues.js";
import { RunLogger } from "../logger/index.js";
import {
  buildImplementPrompt,
  formatPlanReply,
  isIncompletePlan,
  parsePlanApprovalIntent,
  PLAN_RETRY_PROMPT,
  shouldPlanFirst,
  wrapPromptForPlan,
} from "../orchestration/plan-first.js";
import { wrapPromptForAgent, wrapPromptForGeneral } from "../orchestration/prompt.js";
import { ProjectStore } from "../projects/index.js";
import { splitMessage } from "../utils/split.js";
import { formatForWhatsApp } from "../utils/whatsapp-format.js";
import { handleUserMessage } from "./index.js";
import { DirectoryQueues } from "./directory-queues.js";
import type { QueuedPrompt, QueuedRunOptions } from "./queued-prompt.js";
import {
  createProgressHeartbeat,
  formatProgressMessage,
  PROGRESS_INTERVALS_MS,
} from "./progress.js";
import {
  buildStoppedMessage,
  buildTimedOutMessage,
  buildWorkingMessage,
} from "./status-messages.js";
import { AUTO_FRESH_INPUT_TOKENS, formatUsageFooter } from "./usage.js";

export type ReplyFn = (text: string) => Promise<void>;
export type ReactFn = (emoji: string) => Promise<void>;

const QUEUE_CAP = 5;
const MAX_CONCURRENT = 3;

interface RunTarget {
  projectKey: string;
  workspace: string;
}

interface RunPromptOptions {
  react?: ReactFn;
  executionMode?: CursorExecutionMode;
  cursorPrompt?: string;
  skipPlanFirst?: boolean;
  resume?: boolean;
  alreadyAcquired?: boolean;
  sessionKey?: string;
  isCasual?: boolean;
}

export class MessageRouter {
  readonly projects: ProjectStore;
  readonly conversations: ConversationManager;
  readonly runners = new CursorRunnerPool(MAX_CONCURRENT);
  readonly queues = new DirectoryQueues(QUEUE_CAP);
  readonly issues = new GitHubIssues();
  readonly logger: RunLogger;

  constructor(private readonly config: AppConfig) {
    this.projects = new ProjectStore(config);
    this.conversations = new ConversationManager(config.historyDir);
    this.logger = new RunLogger(config.logsDir);
  }

  async handle(
    text: string,
    reply: ReplyFn,
    opts: {
      react?: ReactFn;
      access?: "owner" | "casual";
      conversationKey?: string;
      isForwarded?: boolean;
      hasImage?: boolean;
      imagePath?: string;
    } = {}
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed && !opts.isForwarded) return;

    const isCasual = opts.access === "casual";
    const issueIntent = parseIssueIntent(trimmed);
    const wantsIssue = Boolean(opts.isForwarded) || issueIntent !== null;

    if (wantsIssue) {
      await this.fileGitHubIssue(trimmed, reply, opts, issueIntent);
      return;
    }

    // ask <q> / /ask <q>: read-only Q&A, skip plan-first
    const askMatch = trimmed.match(/^\/?\s*ask\s+(.+)$/is);
    if (askMatch?.[1]) {
      const question = askMatch[1].trim();
      if (isCasual) {
        const target = this.resolveCasualTarget();
        const sKey = sessionStorageKey("general", opts.conversationKey);
        if (await this.tryQueue(trimmed, reply, opts, target, {
          executionMode: "ask",
          skipPlanFirst: true,
          sessionKey: sKey,
          isCasual: true,
        })) return;
        await this.runPrompt(question, reply, target, {
          ...opts,
          executionMode: "ask",
          skipPlanFirst: true,
          sessionKey: sKey,
          isCasual: true,
        });
        return;
      }
      const current = this.projects.getCurrent();
      if (!current) {
        this.projects.setAwaitingProjectPick(true);
        await reply(
          `Which project is this for?\n\n${this.projects.formatPicker()}\n\nReply with a number or the project name.`
        );
        return;
      }
      const target = this.toRunTarget(current);
      if (await this.tryQueue(trimmed, reply, opts, target, {
        executionMode: "ask",
        skipPlanFirst: true,
      })) return;
      await this.runPrompt(question, reply, target, {
        ...opts,
        executionMode: "ask",
        skipPlanFirst: true,
      });
      return;
    }

    const planIntent = parsePlanApprovalIntent(trimmed);
    if (planIntent?.kind === "approve") {
      const pending = this.projects.getPendingPlan();
      if (!pending) {
        await reply("No plan is waiting. Send a task first. Big ones get a plan on their own.");
        return;
      }

      if (isCasual) {
        if (pending.projectKey !== "general") {
          await reply(
            `That plan was for *${pending.projectKey.toUpperCase()}*. Say *cancel plan* to clear it.`
          );
          return;
        }
        const target = this.resolveCasualTarget();
        const sessionKey = sessionStorageKey("general", opts.conversationKey);
        if (await this.tryQueue(trimmed, reply, opts, target, {
          executionMode: "agent",
          skipPlanFirst: true,
          resume: false,
          sessionKey,
          isCasual: true,
        })) return;

        const implementBody = buildImplementPrompt(pending);
        this.projects.setPendingPlan(null);
        await this.runPrompt(implementBody, reply, target, {
          ...opts,
          skipPlanFirst: true,
          resume: false,
          cursorPrompt: wrapPromptForGeneral(implementBody),
          executionMode: "agent",
          sessionKey,
          isCasual: true,
        });
        return;
      }

      const current = this.projects.getCurrent();
      if (!current) {
        this.projects.setAwaitingProjectPick(true);
        await reply(
          `Which project is this for?\n\n${this.projects.formatPicker()}\n\nReply with a number or the project name.`
        );
        return;
      }
      if (pending.projectKey !== current.key) {
        await reply(
          `That plan was for *${pending.projectKey.toUpperCase()}*. Switch back there, or say *cancel plan*.`
        );
        return;
      }

      const target = this.toRunTarget(current);
      if (await this.tryQueue(trimmed, reply, opts, target, {
        executionMode: "agent",
        skipPlanFirst: true,
        resume: false,
      })) return;

      const implementBody = buildImplementPrompt(pending);
      this.projects.setPendingPlan(null);
      const ownerWrap =
        current.key === "general"
          ? wrapPromptForGeneral(implementBody)
          : wrapPromptForAgent(implementBody, this.projects.getAgentMode());
      await this.runPrompt(implementBody, reply, target, {
        ...opts,
        skipPlanFirst: true,
        resume: false,
        cursorPrompt: ownerWrap,
        executionMode: "agent",
      });
      return;
    }

    const command = handleUserMessage({
      projects: this.projects,
      getRunStatus: () => this.getRunStatus(),
      stopCurrent: () => {
        const current = this.projects.getCurrent();
        if (!current) return false;
        return this.runners.stop(current.path);
      },
      stopAllRuns: () => {
        this.runners.stopAll();
      },
      clearCurrentQueue: () => {
        const current = this.projects.getCurrent();
        if (!current) return 0;
        return this.queues.clear(current.path);
      },
      clearAllQueues: () => this.queues.clearAll(),
      raw: trimmed,
      conversations: this.conversations,
      access: opts.access,
      conversationKey: opts.conversationKey,
    });

    if (command.handled) {
      if (command.reply) await reply(command.reply);
      return;
    }

    if (isCasual) {
      const target = this.resolveCasualTarget();
      const sKey = sessionStorageKey("general", opts.conversationKey);
      if (await this.tryQueue(trimmed, reply, opts, target, { sessionKey: sKey, isCasual: true })) return;
      await this.runPrompt(trimmed, reply, target, { ...opts, sessionKey: sKey, isCasual: true });
      return;
    }

    const current = this.projects.getCurrent();
    if (!current) {
      this.projects.setAwaitingProjectPick(true);
      await reply(
        `Which project is this for?\n\n${this.projects.formatPicker()}\n\nReply with a number or the project name.`
      );
      return;
    }

    const target = this.toRunTarget(current);
    if (await this.tryQueue(trimmed, reply, opts, target)) return;

    await this.runPrompt(trimmed, reply, target, opts);
  }

  private async fileGitHubIssue(
    trimmed: string,
    reply: ReplyFn,
    opts: {
      access?: "owner" | "casual";
      isForwarded?: boolean;
      hasImage?: boolean;
      imagePath?: string;
    },
    issueIntent: { body: string } | null
  ): Promise<void> {
    if (opts.access === "casual") {
      await reply("Casual chat can't file GitHub issues.");
      return;
    }

    if (!opts.isForwarded && !opts.hasImage && issueIntent && !issueIntent.body) {
      await reply('What should I file? Forward a message, or send "issue <text>".');
      return;
    }

    const current = this.projects.getCurrent();
    if (!current) {
      this.projects.setAwaitingProjectPick(true);
      await reply(
        `Which project is this for?\n\n${this.projects.formatPicker()}\n\nReply with a number or the project name.`
      );
      return;
    }

    if (current.key === "general") {
      await reply("General isn't a GitHub project. Switch to a code project first.");
      return;
    }

    const source = opts.isForwarded
      ? trimmed || null
      : issueIntent?.body || null;

    if (opts.hasImage && !opts.imagePath && !source) {
      await reply("Couldn't upload that screenshot. Send it again.");
      return;
    }

    let imageUrl: string | undefined;
    if (opts.imagePath) {
      try {
        const attached = await this.issues.attach({
          workspace: current.path,
          filePath: opts.imagePath,
        });
        imageUrl = attached.url;
      } catch (err) {
        const message =
          err instanceof GitHubIssueError || err instanceof Error
            ? err.message
            : String(err);
        await reply(`Couldn't file a GitHub issue: ${message}`);
        return;
      }
    }

    const draft = buildIssueDraft({
      text: source,
      hasImage: opts.hasImage,
      imageUrl,
    });

    try {
      const { url } = await this.issues.create({
        workspace: current.path,
        title: draft.title,
        body: draft.body,
      });
      await reply(`Filed: ${url}`);
    } catch (err) {
      const message =
        err instanceof GitHubIssueError || err instanceof Error
          ? err.message
          : String(err);
      await reply(`Couldn't file a GitHub issue: ${message}`);
    }
  }

  private toRunTarget(project: { key: string; path: string }): RunTarget {
    return { projectKey: project.key, workspace: project.path };
  }

  private resolveCasualTarget(): RunTarget {
    return { projectKey: "general", workspace: this.config.generalDir };
  }

  private getRunStatus() {
    return {
      busy: this.runners.listBusy(),
      queuedCount: this.queues.totalSize(),
      queueDepths: this.queues.queueDepths().map((q) => {
        const busy = this.runners.listBusy().find((b) => b.workspace === q.workspace);
        return {
          projectKey: busy?.projectKey ?? this.projectKeyForWorkspace(q.workspace),
          workspace: q.workspace,
          depth: q.depth,
        };
      }),
    };
  }

  private projectKeyForWorkspace(workspace: string): string {
    for (const key of this.projects.list()) {
      const resolved = this.projects.resolve(key);
      if (resolved?.path === workspace) return resolved.key;
    }
    return workspace;
  }

  private async tryQueue(
    trimmed: string,
    reply: ReplyFn,
    opts: { react?: ReactFn },
    target: RunTarget,
    runOpts?: QueuedRunOptions
  ): Promise<boolean> {
    const { workspace, projectKey } = target;
    const workspaceBusy = this.runners.isBusy(workspace);
    const waitingForSlot = !workspaceBusy && !this.runners.hasCapacity();

    if (!workspaceBusy && !waitingForSlot) return false;

    const enqueued = this.queues.enqueue({
      prompt: trimmed,
      reply,
      react: opts.react,
      projectKey,
      workspace,
      runOpts,
    });

    if (!enqueued.ok) {
      await reply(
        `Queue is full (${QUEUE_CAP} tasks for this project). Wait for one to finish, or say *stop all*.`
      );
      return true;
    }

    if (waitingForSlot) {
      const running = this.runners.listBusy().length;
      await reply(
        enqueued.position === 1
          ? `Queued. Waiting for a free agent (${running} running, max ${MAX_CONCURRENT})`
          : `Queued. ${enqueued.position} tasks waiting for a free agent (${running} running)`
      );
      return true;
    }

    const ahead = 1 + (enqueued.position - 1);
    await reply(
      ahead === 1 ? "Queued. 1 task ahead" : `Queued. ${ahead} tasks ahead`
    );
    return true;
  }

  private async runQueuedPrompt(item: QueuedPrompt): Promise<void> {
    const target = { projectKey: item.projectKey, workspace: item.workspace };
    const opts: RunPromptOptions = {
      react: item.react,
      alreadyAcquired: true,
      ...(item.runOpts ?? {}),
    };
    await this.runPrompt(item.prompt, item.reply, target, opts);
  }

  private async drainAfterRun(preferredWorkspace: string): Promise<void> {
    const started: Promise<void>[] = [];
    let prefer = preferredWorkspace;

    while (this.runners.hasCapacity()) {
      let item: QueuedPrompt | null = null;

      if (prefer && !this.runners.isBusy(prefer)) {
        item = this.queues.dequeue(prefer);
      }
      if (!item) {
        item = this.queues.findNextIdleQueue((ws) => this.runners.isBusy(ws));
      }
      if (!item) break;

      if (!this.runners.tryAcquire(item.workspace, item.projectKey)) {
        this.queues.enqueueFront(item);
        break;
      }

      started.push(this.runQueuedPrompt(item));
      prefer = "";
    }

    if (started.length > 0) {
      await Promise.all(started);
    }
  }

  private async runPrompt(
    trimmed: string,
    reply: ReplyFn,
    target: RunTarget,
    opts: RunPromptOptions = {}
  ): Promise<void> {
    const { projectKey, workspace } = target;

    if (!opts.alreadyAcquired) {
      if (!this.runners.tryAcquire(workspace, projectKey)) {
        const enqueued = this.queues.enqueue({
          prompt: trimmed,
          reply,
          react: opts.react,
          projectKey,
          workspace,
          runOpts: {
            executionMode: opts.executionMode,
            cursorPrompt: opts.cursorPrompt,
            skipPlanFirst: opts.skipPlanFirst,
            sessionKey: opts.sessionKey,
            isCasual: opts.isCasual,
            resume: opts.resume,
          },
        });
        if (enqueued.ok) {
          await reply("Queued. 1 task ahead");
        } else {
          await reply(
            `Queue is full (${QUEUE_CAP} tasks for this project). Wait for one to finish, or say *stop all*.`
          );
        }
        return;
      }
    }

    const planFirst = !opts.skipPlanFirst && shouldPlanFirst(trimmed);
    const executionMode: CursorExecutionMode =
      opts.executionMode ?? (planFirst ? "ask" : "agent");
    const isPlanning = executionMode === "ask" || executionMode === "plan";

    const storageKey = opts.sessionKey ?? projectKey;
    const prevState = this.conversations.load(storageKey);
    const autoFresh =
      !isPlanning &&
      (prevState.lastInputTokens ?? 0) >= AUTO_FRESH_INPUT_TOKENS;
    if (autoFresh) this.conversations.setChatId(storageKey, null);
    const resume = autoFresh ? false : (opts.resume ?? !planFirst);
    const useGeneralChat = Boolean(opts.isCasual) || projectKey === "general";
    const cursorPrompt =
      opts.cursorPrompt ??
      (isPlanning
        ? wrapPromptForPlan(trimmed)
        : useGeneralChat
          ? wrapPromptForGeneral(trimmed)
          : wrapPromptForAgent(trimmed, this.projects.getAgentMode()));

    if (opts.react) {
      try {
        await opts.react("👀");
      } catch (err) {
        console.warn("[cursor] react ack failed:", err);
        await reply(buildWorkingMessage(projectKey, executionMode));
      }
    } else {
      await reply(buildWorkingMessage(projectKey, executionMode));
    }

    if (autoFresh) {
      await reply("Chat reset to save tokens. Starting fresh.");
    }

    const agentModeLabel = useGeneralChat ? "general" : this.projects.getAgentMode();
    console.log(
      `[cursor] start project=${projectKey} mode=${agentModeLabel} cursorMode=${executionMode} resume=${resume} prompt=${trimmed.slice(0, 80)}`
    );

    const liveProgress = createLiveProgressReporter({
      minIntervalMs: 12_000,
      onSend: async (step) => {
        try {
          const line = step.includes(" · ") ? `▸ ${step}` : step;
          await reply(line);
          console.log(`[cursor] ▸ ${projectKey} | ${step}`);
        } catch (err) {
          console.warn("[cursor] progress send failed:", err);
        }
      },
    });

    const heartbeat = createProgressHeartbeat({
      intervalsMs: PROGRESS_INTERVALS_MS,
      onTick: async (elapsedSec) => {
        try {
          const last = liveProgress.lastText();
          const msg = last
            ? `${formatProgressMessage(elapsedSec, projectKey)}\nLast: ${last}`
            : formatProgressMessage(elapsedSec, projectKey);
          await reply(msg);
          console.log(`[cursor] heartbeat project=${projectKey} elapsed=${elapsedSec}s`);
        } catch (err) {
          console.warn("[cursor] heartbeat send failed:", err);
        }
      },
    });

    try {
      let result = await this.runners.runAcquired({
        cursorBin: this.config.cursorBin,
        workspace,
        prompt: cursorPrompt,
        projectKey,
        conversations: this.conversations,
        executionMode,
        resume,
        timeoutMs: this.config.cursorTimeoutMin * 60_000,
        onProgress: (step) => liveProgress.report(step),
        sessionKey: opts.sessionKey,
      });

      if (
        isPlanning &&
        result.exitCode === 0 &&
        !result.cancelled &&
        !result.timedOut &&
        isIncompletePlan(result.stdout)
      ) {
        console.log(`[cursor] plan stub detected. Retrying for full plan text`);
        this.runners.markRunning(workspace, projectKey);
        result = await this.runners.runAcquired({
          cursorBin: this.config.cursorBin,
          workspace,
          prompt: PLAN_RETRY_PROMPT,
          projectKey,
          conversations: this.conversations,
          executionMode,
          resume: true,
          timeoutMs: this.config.cursorTimeoutMin * 60_000,
        });
      }

      liveProgress.stop();
      heartbeat.stop();
      console.log(
        `[cursor] done project=${projectKey} cursorMode=${executionMode} exit=${result.exitCode} duration=${result.durationSec}s cancelled=${result.cancelled} timedOut=${result.timedOut}`
      );

      if (result.timedOut) {
        this.logger.log({
          time: new Date().toISOString(),
          project: projectKey,
          prompt: trimmed,
          duration: result.durationSec,
          exit: result.exitCode,
          error: "timed_out",
        });
        await reply(buildTimedOutMessage());
        return;
      }

      if (result.cancelled) {
        this.logger.log({
          time: new Date().toISOString(),
          project: projectKey,
          prompt: trimmed,
          duration: result.durationSec,
          exit: result.exitCode,
          error: "cancelled",
        });
        await reply(buildStoppedMessage());
        return;
      }

      let response =
        result.stdout ||
        result.stderr ||
        (result.exitCode === 0
          ? "(Cursor finished with no output.)"
          : "Cursor exited unexpectedly.");

      if (result.exitCode !== 0 && result.stdout && result.stderr) {
        response = `${result.stdout}\n\n---\n${result.stderr}`;
      } else if (result.exitCode !== 0 && !result.stdout && result.stderr) {
        response = `Cursor exited unexpectedly.\n\n${result.stderr}`;
      } else if (result.exitCode !== 0 && !result.stdout && !result.stderr) {
        response = "Cursor exited unexpectedly.";
      }

      this.conversations.append(storageKey, trimmed, response, result.chatId, result.usage ?? undefined);
      this.logger.log({
        time: new Date().toISOString(),
        project: projectKey,
        prompt: trimmed,
        response: response.slice(0, 2000),
        duration: result.durationSec,
        exit: result.exitCode,
        ...(result.usage
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            }
          : {}),
      });

      if (isPlanning && result.exitCode === 0) {
        if (isIncompletePlan(response)) {
          await reply(
            "I couldn't get a full plan text back (Cursor only returned a status line). Try sending the task again, or split it into smaller pieces."
          );
          return;
        }
        this.projects.setPendingPlan({
          projectKey,
          userPrompt: trimmed,
          planText: response,
        });
        const planReply = formatPlanReply(formatForWhatsApp(response));
        for (const chunk of splitMessage(planReply, this.config.maxWhatsAppChars)) {
          await reply(chunk);
        }
        return;
      }

      let formatted = formatForWhatsApp(response);
      if (result.usage) {
        formatted = `${formatted}\n\n${formatUsageFooter(result.usage)}`;
      }
      for (const chunk of splitMessage(formatted, this.config.maxWhatsAppChars)) {
        await reply(chunk);
      }
    } catch (err) {
      liveProgress.stop();
      heartbeat.stop();
      console.error(`[cursor] error project=${projectKey}:`, err);
      if (err instanceof CursorBusyError) {
        const enqueued = this.queues.enqueue({
          prompt: trimmed,
          reply,
          react: opts.react,
          projectKey,
          workspace,
          runOpts: {
            executionMode: opts.executionMode,
            cursorPrompt: opts.cursorPrompt,
            skipPlanFirst: opts.skipPlanFirst,
            sessionKey: opts.sessionKey,
          },
        });
        if (enqueued.ok) {
          await reply("Queued. 1 task ahead");
        } else {
          await reply(err.message);
        }
        return;
      }
      if (err instanceof CursorNotFoundError) {
        await reply("Cursor CLI not found.");
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.logger.log({
        time: new Date().toISOString(),
        project: projectKey,
        prompt: trimmed,
        duration: 0,
        exit: null,
        error: message,
      });
      await reply(message);
    } finally {
      if (this.runners.listBusy().some((b) => b.workspace === workspace)) {
        this.runners.markIdle(workspace);
      }
      await this.drainAfterRun(workspace);
    }
  }
}
