import type { ConversationManager } from "../conversation/index.js";
import type { BusyRun } from "../cursor/runner-pool.js";
import { sessionStorageKey } from "../cursor/session-key.js";
import {
  formatAgentModeReply,
  parseAgentModeIntent,
} from "../orchestration/mode.js";
import { parsePlanApprovalIntent } from "../orchestration/plan-first.js";
import type { ProjectStore } from "../projects/index.js";
import {
  buildBusyStatusMessage,
  buildIdleStatusMessage,
  buildMultiAgentStatusMessage,
} from "./status-messages.js";

interface RunStatus {
  busy: BusyRun[];
  queuedCount: number;
  queueDepths: { projectKey: string; depth: number }[];
}

export interface CommandContext {
  projects: ProjectStore;
  raw: string;
  conversations?: ConversationManager;
  getRunStatus: () => RunStatus;
  stopCurrent: () => boolean;
  stopAllRuns: () => void;
  clearCurrentQueue: () => number;
  clearAllQueues: () => number;
  access?: "owner" | "casual";
  conversationKey?: string;
}

export interface CommandResult {
  handled: boolean;
  reply?: string;
  passToAgent?: boolean;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function stripSlash(text: string): string {
  return text.startsWith("/") ? text.slice(1).trim() : text;
}

export function buildHelpMessage(projects: ProjectStore): string {
  const current = projects.getCurrent();
  const projectLine = current
    ? `You're in *${current.key.toUpperCase()}* right now.`
    : "You haven't picked a project yet.";

  return [
    "Hey — you can talk to Cursor right here.",
    "",
    projectLine,
    "",
    "Just text me what you want done, or forward a screenshot.",
    "",
    "*Which project?* Reply with a number or the name:",
    projects.formatPicker(),
    "",
    "You can also say things like:",
    '• "ask <question>" — read-only Q&A (no edits)',
    '• Forward a message (or "issue <text>") - file a GitHub issue',
    '• "switch to shop"',
    '• "what project am I on?"',
    '• "new chat" to start a fresh Cursor thread',
    '• "status" to check if I\'m still working',
    '• "stop" if I\'m still working',
    '• "stop all" to cancel and clear the queue',
    '• "orchestrate" — main agent + specialist subagents (default)',
    '• "solo" — one agent, no fan-out',
    '• "which mode" — show orchestrate vs solo',
    "• Big tasks get a *plan* first — reply *go* to implement",
  ].join("\n");
}

export function buildCasualHelpMessage(): string {
  return [
    "Hey — you're in *GENERAL* casual chat.",
    "",
    "Just text me what you want to talk about.",
    "",
    "You can also say:",
    '• "ask <question>" — read-only Q&A',
    '• "new chat" to start a fresh thread',
    '• "status" to check if I\'m still working',
    '• "stop" if I\'m still working',
  ].join("\n");
}

function buildProjectPrompt(projects: ProjectStore, intro?: string): string {
  return [
    intro ?? "Which project should I use?",
    "",
    projects.formatPicker(),
    "",
    "Reply with a number or the project name.",
  ].join("\n");
}

function tryPickProject(
  projects: ProjectStore,
  raw: string,
  opts: { allowNumber: boolean }
): CommandResult | null {
  const text = normalize(raw);

  if (opts.allowNumber && /^\d+$/.test(text)) {
    const picked = projects.pickByNumber(Number(text));
    if (!picked) {
      return {
        handled: true,
        reply: `That number isn't on the list.\n\n${buildProjectPrompt(projects)}`,
      };
    }
    return {
      handled: true,
      reply: `Got it — working in *${picked.key.toUpperCase()}* now.\n\nWhat do you need?`,
    };
  }

  if (projects.resolve(text)) {
    const set = projects.setCurrent(text)!;
    return {
      handled: true,
      reply: `Got it — working in *${set.key.toUpperCase()}* now.\n\nWhat do you need?`,
    };
  }

  const switchMatch = text.match(
    /^(?:switch\s+to|use|go\s+to|open|project)\s+(.+)$/i
  );
  if (switchMatch?.[1]) {
    const name = switchMatch[1].trim();
    const set = projects.setCurrent(name);
    if (!set) {
      projects.setAwaitingProjectPick(true);
      return {
        handled: true,
        reply: `I don't have a project called "${name}".\n\n${buildProjectPrompt(projects)}`,
      };
    }
    return {
      handled: true,
      reply: `Switched to *${set.key.toUpperCase()}*.\n\nWhat do you need?`,
    };
  }

  return null;
}

export function handleUserMessage(ctx: CommandContext): CommandResult {
  const text = normalize(ctx.raw);
  if (!text) return { handled: true };

  const body = stripSlash(text);
  const lower = body.toLowerCase();

  if (ctx.access === "casual") {
    if (ctx.projects.isAwaitingProjectPick()) {
      if (/^\d+$/.test(body)) {
        return { handled: true, reply: "You're in casual chat — no project access." };
      }
      const picked = tryPickProject(ctx.projects, body, { allowNumber: false });
      if (picked) {
        return { handled: true, reply: "You're in casual chat — no project access." };
      }
      ctx.projects.setAwaitingProjectPick(false);
    }

    if (
      /^(help|hi|hello|hey|menu)$/i.test(lower) ||
      /^what can you do\b/i.test(lower) ||
      /^start$/i.test(lower)
    ) {
      return { handled: true, reply: buildCasualHelpMessage() };
    }

    if (
      /^(projects|list projects|show projects|switch project|change project|choose project)\b/i.test(lower)
    ) {
      return { handled: true, reply: "You're in casual chat — no project access." };
    }

    const switchMatch = body.match(/^(?:switch\s+to|use|go\s+to|open|project)\s+(.+)$/i);
    if (switchMatch) {
      return { handled: true, reply: "You're in casual chat — no project access." };
    }

    if (/^(current|where am i|which project|what project)/i.test(lower)) {
      return { handled: true, reply: "You're in *GENERAL* (casual chat)" };
    }
  }

  if (ctx.projects.isAwaitingProjectPick()) {
    const picked = tryPickProject(ctx.projects, body, { allowNumber: true });
    if (picked) return picked;

    if (ctx.projects.getCurrent()) {
      ctx.projects.setAwaitingProjectPick(false);
    } else {
      return {
        handled: true,
        reply: `Still need a project first.\n\n${buildProjectPrompt(ctx.projects)}`,
      };
    }
  }

  const modeIntent = parseAgentModeIntent(body);
  if (modeIntent) {
    const inGeneral =
      ctx.access === "casual" || ctx.projects.getCurrent()?.key === "general";
    if (inGeneral) {
      return {
        handled: true,
        reply:
          "General chat doesn't use orchestrate/solo — just talk normally. Switch to a code project to change agent mode.",
      };
    }
    if (modeIntent.kind === "set") {
      ctx.projects.setAgentMode(modeIntent.mode);
      return {
        handled: true,
        reply: formatAgentModeReply(modeIntent.mode, "set"),
      };
    }
    return {
      handled: true,
      reply: formatAgentModeReply(ctx.projects.getAgentMode(), "query"),
    };
  }

  const planIntent = parsePlanApprovalIntent(body);
  if (planIntent?.kind === "cancel") {
    if (!ctx.projects.getPendingPlan()) {
      return { handled: true, reply: "No plan waiting to cancel." };
    }
    ctx.projects.setPendingPlan(null);
    return { handled: true, reply: "Cleared the pending plan." };
  }

  if (/^(new chat|start fresh|reset chat|clear chat|fresh chat)\b/i.test(lower)) {
    if (!ctx.conversations) {
      return {
        handled: true,
        reply: "I can't reset the chat right now — try again in a moment.",
      };
    }
    if (ctx.access === "casual") {
      const storageKey = sessionStorageKey("general", ctx.conversationKey);
      ctx.conversations.setChatId(storageKey, null);
      ctx.projects.setPendingPlan(null);
      return {
        handled: true,
        reply: "Clean slate for *GENERAL* — next message starts a fresh Cursor chat.",
      };
    }
    const current = ctx.projects.getCurrent();
    if (!current) {
      ctx.projects.setAwaitingProjectPick(true);
      return {
        handled: true,
        reply: buildProjectPrompt(ctx.projects, "Pick a project first, then we can start a new chat."),
      };
    }
    ctx.conversations.setChatId(current.key, null);
    ctx.projects.setPendingPlan(null);
    return {
      handled: true,
      reply: `Clean slate for *${current.key.toUpperCase()}* — next message starts a fresh Cursor chat.`,
    };
  }

  if (
    /^(help|hi|hello|hey|menu)$/i.test(lower) ||
    /^what can you do\b/i.test(lower) ||
    /^start$/i.test(lower)
  ) {
    ctx.projects.setAwaitingProjectPick(true);
    return { handled: true, reply: buildHelpMessage(ctx.projects) };
  }

  if (
    /^(projects|list projects|show projects|switch project|change project|choose project)\b/i.test(
      lower
    )
  ) {
    ctx.projects.setAwaitingProjectPick(true);
    return {
      handled: true,
      reply: buildProjectPrompt(ctx.projects, "Sure — which project?"),
    };
  }

  if (/^(current|where am i|which project|what project)/i.test(lower)) {
    const current = ctx.projects.getCurrent();
    if (!current) {
      ctx.projects.setAwaitingProjectPick(true);
      return {
        handled: true,
        reply: buildProjectPrompt(ctx.projects, "You haven't picked one yet."),
      };
    }
    return {
      handled: true,
      reply: `You're in *${current.key.toUpperCase()}*\n${current.displayPath}`,
    };
  }

  // Status — multi-agent aware
  if (
    /^(status|are you (still )?working|you there|still working)\??$/i.test(lower)
  ) {
    const status = ctx.getRunStatus();
    if (status.busy.length > 1) {
      return {
        handled: true,
        reply: buildMultiAgentStatusMessage(status.busy, status.queueDepths.length > 0 ? status.queueDepths : status.queuedCount),
      };
    }
    if (status.busy.length === 1) {
      return {
        handled: true,
        reply: buildBusyStatusMessage(status.busy[0]!.projectKey),
      };
    }
    return { handled: true, reply: buildIdleStatusMessage() };
  }

  // Stop all — cancel every run and clear all queues
  if (/^(stop all|cancel all)\b/i.test(lower)) {
    const status = ctx.getRunStatus();
    const cleared = ctx.clearAllQueues();
    if (status.busy.length > 0) {
      ctx.stopAllRuns();
      return {
        handled: true,
        reply:
          cleared > 0
            ? `Okay, stopping ${status.busy.length} run${status.busy.length === 1 ? "" : "s"} and clearing ${cleared} queued task${cleared === 1 ? "" : "s"}…`
            : `Okay, stopping ${status.busy.length === 1 ? "that" : `all ${status.busy.length} runs`}…`,
      };
    }
    if (cleared > 0) {
      return {
        handled: true,
        reply: `Cleared ${cleared} queued task${cleared === 1 ? "" : "s"}. Nothing's running.`,
      };
    }
    return { handled: true, reply: "Nothing's running right now." };
  }

  // Stop current project's run only
  if (/^(stop|cancel|never ?mind)\b/i.test(lower)) {
    const status = ctx.getRunStatus();
    if (status.busy.length === 0) {
      return { handled: true, reply: "Nothing's running right now." };
    }
    const stopped = ctx.stopCurrent();
    const cleared = ctx.clearCurrentQueue();
    if (!stopped && cleared === 0) {
      return { handled: true, reply: "Nothing's running for the current project." };
    }
    return {
      handled: true,
      reply: cleared > 0
        ? `Okay, stopping that and clearing ${cleared} queued task${cleared === 1 ? "" : "s"}…`
        : "Okay, stopping that…",
    };
  }

  const picked = tryPickProject(ctx.projects, body, { allowNumber: false });
  if (picked) return picked;

  if (text.startsWith("/")) {
    ctx.projects.setAwaitingProjectPick(true);
    return {
      handled: true,
      reply: `Hmm, I'm not sure what that means.\n\n${buildHelpMessage(ctx.projects)}`,
    };
  }

  if (!ctx.projects.getCurrent()) {
    ctx.projects.setAwaitingProjectPick(true);
    return {
      handled: true,
      reply: buildProjectPrompt(
        ctx.projects,
        "Quick one first — which project is this for?"
      ),
    };
  }

  return { handled: false, passToAgent: true };
}
