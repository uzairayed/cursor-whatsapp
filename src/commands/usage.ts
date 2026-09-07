import type { TokenUsage } from "../cursor/types.js";

export type { TokenUsage };

/** Warn when a single turn's input context is getting heavy. */
export const CONTEXT_WARN_INPUT_TOKENS = 100_000;

/** Automatically start a fresh chat when the previous turn hit this threshold. */
export const AUTO_FRESH_INPUT_TOKENS = 80_000;

export function shouldWarnContext(usage: Pick<TokenUsage, "inputTokens">): boolean {
  return usage.inputTokens >= CONTEXT_WARN_INPUT_TOKENS;
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
}

export function formatUsageFooter(
  usage: TokenUsage,
  opts: { warn?: boolean } = {}
): string {
  const warn = opts.warn ?? shouldWarnContext(usage);
  const base = `_${formatTokenCount(usage.inputTokens)} tokens this turn_`;
  if (!warn) return base;
  return `${base}\nChat is getting large. Say *new chat* to start fresh.`;
}
