export interface ProgressEvent {
  kind: "tool" | "assistant";
  text: string;
}

type ToolCallBag = Record<string, unknown>;

function basename(path: string): string {
  const cleaned = path.replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function summarizeShellCommand(cmd: string): string {
  const compact = cmd.replace(/\s+/g, " ").trim();
  const noAbs = compact.replace(/(?:\/[\w.@+-]+)+\/([\w.@+-]+)/g, "$1");
  const first = noAbs.split(/\s*&&\s*|\s*\|\s*/)[0]?.trim() || noAbs;
  return truncate(first, 52);
}

function argsOf(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== "object") return {};
  const args = (node as { args?: unknown }).args;
  if (!args || typeof args !== "object") return {};
  return args as Record<string, unknown>;
}

function humanizeToolName(tool: string): string {
  const key = tool.toLowerCase();
  if (key.includes("todo")) return "Todos";
  if (key.includes("task")) return "Task";
  if (key.includes("browser") || key.includes("screenshot")) return "Browser";
  if (key.includes("mcp")) return "MCP";
  const spaced = tool
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced.replace(/\b\w/g, (c) => c.toUpperCase()) : "Tool";
}

export function formatToolCallProgress(toolCall: ToolCallBag): string | null {
  for (const [key, value] of Object.entries(toolCall)) {
    if (!key.endsWith("ToolCall")) continue;
    const args = argsOf(value);
    const tool = key.slice(0, -"ToolCall".length);
    const toolKey = tool.toLowerCase();

    if (toolKey.includes("read") || toolKey === "readfile") {
      const path = typeof args.path === "string" ? args.path : null;
      return path ? `Read · \`${basename(path)}\`` : "Read · file";
    }
    if (
      toolKey.includes("edit") ||
      toolKey.includes("write") ||
      toolKey.includes("searchreplace") ||
      toolKey.includes("apply")
    ) {
      const path =
        typeof args.path === "string"
          ? args.path
          : typeof args.file_path === "string"
            ? args.file_path
            : null;
      return path ? `Edit · \`${basename(path)}\`` : "Edit · file";
    }
    if (toolKey.includes("shell") || toolKey.includes("bash") || toolKey.includes("terminal")) {
      const cmd =
        typeof args.command === "string"
          ? args.command
          : typeof args.cmd === "string"
            ? args.cmd
            : null;
      return cmd ? `Run · \`${summarizeShellCommand(cmd)}\`` : "Run · command";
    }
    if (toolKey.includes("grep") || toolKey.includes("rg") || toolKey === "search") {
      const pattern = typeof args.pattern === "string" ? args.pattern : null;
      return pattern
        ? `Search · \`${truncate(pattern, 36)}\``
        : "Search · codebase";
    }
    if (toolKey.includes("glob")) {
      const glob =
        typeof args.glob_pattern === "string"
          ? args.glob_pattern
          : typeof args.pattern === "string"
            ? args.pattern
            : null;
      return glob ? `Find · \`${truncate(glob, 36)}\`` : "Find · files";
    }
    if (toolKey.includes("delete")) {
      const path = typeof args.path === "string" ? args.path : null;
      return path ? `Delete · \`${basename(path)}\`` : "Delete · file";
    }
    if (toolKey.includes("todo")) {
      return "Todos · updating";
    }

    return `${humanizeToolName(tool)} · working`;
  }
  return null;
}

function assistantTextFromEvent(event: {
  message?: { content?: Array<{ type?: string; text?: string }> };
}): string {
  const parts = event.message?.content ?? [];
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
    .trim();
}

function formatAssistantProgress(text: string): string | null {
  if (!text || text.length < 12) return null;
  if (text.includes("###") || text.includes("\n\n") || text.length > 180) {
    return null;
  }
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim() || text;
  if (first.length < 12) return null;
  return truncate(first, 120);
}

export function progressEventFromStreamLine(line: string): ProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;

  let event: {
    type?: string;
    subtype?: string;
    tool_call?: ToolCallBag;
    message?: { content?: Array<{ type?: string; text?: string }> };
  };
  try {
    event = JSON.parse(trimmed) as typeof event;
  } catch {
    return null;
  }

  if (event.type === "tool_call" && event.subtype === "started" && event.tool_call) {
    const text = formatToolCallProgress(event.tool_call);
    return text ? { kind: "tool", text } : null;
  }

  if (event.type === "assistant") {
    const text = formatAssistantProgress(assistantTextFromEvent(event));
    return text ? { kind: "assistant", text } : null;
  }

  return null;
}

export function createLiveProgressReporter(opts: {
  minIntervalMs: number;
  onSend: (message: string) => void | Promise<void>;
}): {
  report: (text: string) => void;
  lastText: () => string | null;
  stop: () => void;
} {
  let lastSentAt = 0;
  let pending: string | null = null;
  let lastText: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const flush = () => {
    if (stopped || !pending) return;
    const msg = pending;
    pending = null;
    lastSentAt = Date.now();
    lastText = msg;
    void opts.onSend(msg);
  };

  const schedule = () => {
    if (timer !== null || stopped) return;
    const wait = Math.max(0, opts.minIntervalMs - (Date.now() - lastSentAt));
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, wait);
  };

  return {
    report(text: string) {
      if (stopped) return;
      const cleaned = text.trim();
      if (!cleaned) return;
      if (cleaned === lastText && !pending) return;
      lastText = cleaned;
      pending = cleaned;
      if (lastSentAt === 0) {
        flush();
        return;
      }
      if (Date.now() - lastSentAt >= opts.minIntervalMs) {
        flush();
        return;
      }
      schedule();
    },
    lastText: () => lastText,
    stop() {
      stopped = true;
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
