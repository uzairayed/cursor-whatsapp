export type AgentMode = "orchestrate" | "solo";

export const DEFAULT_AGENT_MODE: AgentMode = "orchestrate";

export type AgentModeIntent =
  | { kind: "set"; mode: AgentMode }
  | { kind: "query" };

export function parseAgentMode(raw: string | null | undefined): AgentMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "solo") return "solo";
  if (value === "orchestrate") return "orchestrate";
  return DEFAULT_AGENT_MODE;
}

function normalizeIntentText(text: string): string {
  const trimmed = text.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1).trim() : trimmed;
  return withoutSlash.replace(/\s+/g, " ").toLowerCase();
}

/** Whole-message command match; allows a trailing "please" / punctuation. */
function isModeCommand(normalized: string, phrase: string): boolean {
  if (normalized === phrase) return true;
  return (
    normalized === `${phrase} please` ||
    normalized === `${phrase}.` ||
    normalized === `${phrase}!` ||
    normalized === `${phrase}?`
  );
}

export function parseAgentModeIntent(text: string): AgentModeIntent | null {
  const normalized = normalizeIntentText(text);

  if (
    isModeCommand(normalized, "orchestrate") ||
    isModeCommand(normalized, "multi agent") ||
    isModeCommand(normalized, "use agents")
  ) {
    return { kind: "set", mode: "orchestrate" };
  }

  if (
    isModeCommand(normalized, "solo") ||
    isModeCommand(normalized, "single agent") ||
    isModeCommand(normalized, "no agents")
  ) {
    return { kind: "set", mode: "solo" };
  }

  if (
    isModeCommand(normalized, "agent mode") ||
    isModeCommand(normalized, "which mode")
  ) {
    return { kind: "query" };
  }

  return null;
}

export function formatAgentModeReply(
  mode: AgentMode,
  action: "set" | "query"
): string {
  if (action === "query") {
    return mode === "orchestrate"
      ? "Agent mode: *orchestrate*. The main agent can launch helpers."
      : "Agent mode: *solo*. One agent does the work.";
  }

  return mode === "orchestrate"
    ? "Switched to *orchestrate*. I'll use a main agent plus helpers for bigger work."
    : "Switched to *solo*. One agent, no helpers.";
}
