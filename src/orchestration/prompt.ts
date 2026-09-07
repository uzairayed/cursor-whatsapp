import type { AgentMode } from "./mode.js";

const ORCHESTRATION_PREAMBLE = [
  "You are the main orchestrator agent for this task.",
  "",
  "Operating rules:",
  "- Prefer written specs under specs/ when present; for large work, write or update a short feature spec first.",
  "- For multi-step work, do NOT do everything inline. Launch specialist subagents via the Task tool:",
  "  - tester — write a failing test for one acceptance criterion (RED)",
  "  - implementer — minimal production code to make that test pass (GREEN)",
  "  - reviewer — verify against the feature spec and run tests",
  "- Enforce red → green → refactor. No production code without a failing test first.",
  "- Parallelize independent workstreams with multiple Task calls in one message.",
  "- Return a concise final summary suitable for WhatsApp.",
  "",
  "User task:",
].join("\n");

const GENERAL_CHAT_PREAMBLE = [
  "This is a general-purpose WhatsApp chat, not a coding project.",
  "",
  "Rules:",
  "- Answer normally. Do not mention skipping TDD, subagents, or orchestration.",
  "- No skills. No tester, implementer, or reviewer subagents. No TDD or orchestration workflows.",
  "- Keep replies concise and WhatsApp-friendly.",
  "",
  "User message:",
].join("\n");

export function wrapPromptForAgent(userPrompt: string, mode: AgentMode): string {
  if (mode === "solo") return userPrompt;
  return `${ORCHESTRATION_PREAMBLE}\n${userPrompt}`;
}

export function wrapPromptForGeneral(userPrompt: string): string {
  return `${GENERAL_CHAT_PREAMBLE}\n${userPrompt}`;
}
