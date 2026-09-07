import type { TokenUsage } from "./types.js";

interface CursorStreamEvent {
  type?: string;
  result?: string;
  session_id?: string;
  usage?: TokenUsage;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  timestamp_ms?: number;
  model_call_id?: string;
}

export interface ExtractedCursorText {
  text: string;
  sessionId: string | null;
  usage: TokenUsage | null;
}

function assistantText(event: CursorStreamEvent): string {
  const parts = event.message?.content ?? [];
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("");
}

/** Skip stream-partial duplicate flushes when those fields are present. */
function isUsableAssistantEvent(event: CursorStreamEvent): boolean {
  if (event.type !== "assistant") return false;
  if (event.model_call_id) return false;
  // Final flush duplicates omit timestamp_ms when stream-partial is on;
  // without stream-partial, complete messages also omit it — keep those.
  if (event.timestamp_ms === undefined && event.model_call_id === undefined) {
    // Heuristic: if message exists and looks complete, keep it.
    return Boolean(assistantText(event));
  }
  return true;
}

/**
 * Parse Cursor --output-format json or stream-json stdout into the best user-facing text.
 * When the terminal result is a short stub, prefer the longest assistant message.
 */
export function extractCursorText(stdout: string): ExtractedCursorText {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let resultText = "";
  let sessionId: string | null = null;
  let usage: TokenUsage | null = null;
  const assistantMessages: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as CursorStreamEvent;
      if (event.session_id) sessionId = event.session_id;
      if (event.type === "result") {
        resultText = (event.result ?? "").trim();
        if (event.usage) usage = event.usage;
        if (event.session_id) sessionId = event.session_id;
        continue;
      }
      if (isUsableAssistantEvent(event)) {
        const text = assistantText(event).trim();
        if (text) assistantMessages.push(text);
      }
    } catch {
      // ignore non-JSON lines
    }
  }

  if (!resultText && lines.length === 1) {
    try {
      const single = JSON.parse(lines[0]!) as CursorStreamEvent;
      resultText = (single.result ?? "").trim();
      sessionId = single.session_id ?? sessionId;
      usage = single.usage ?? usage;
    } catch {
      // fall through
    }
  }

  const longestAssistant = assistantMessages.reduce(
    (best, cur) => (cur.length > best.length ? cur : best),
    ""
  );

  // Prefer a substantially longer assistant segment over a short result stub.
  let text = resultText;
  const stubResult =
    !resultText ||
    (resultText.length < 220 &&
      /\b(i('ll| will)|let me)\s+(review|inspect|check|look|draft)\b|\bthen draft\b/i.test(
        resultText
      ));
  if (
    longestAssistant &&
    (stubResult || longestAssistant.length >= Math.max(120, resultText.length * 2))
  ) {
    if (longestAssistant.length > resultText.length) text = longestAssistant;
  } else if (!text && longestAssistant) {
    text = longestAssistant;
  } else if (!text) {
    text = stdout.trim().startsWith("{") ? "" : stdout.trim();
  }

  return { text, sessionId, usage };
}
