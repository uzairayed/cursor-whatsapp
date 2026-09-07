export interface PendingPlan {
  projectKey: string;
  userPrompt: string;
  planText: string;
}

export type PlanApprovalIntent = { kind: "approve" } | { kind: "cancel" };

const PLAN_PREAMBLE = [
  "You are planning only (read-only). Do not edit files or run mutating commands.",
  "Your FINAL message must be the complete plan itself — not a promise to draft one,",
  "not 'I'll review…', and not a status update. Put the whole plan in that message.",
  "",
  "Required sections (keep it WhatsApp-short):",
  "1. Goal",
  "2. Specs to write or update (if any)",
  "3. Ordered slices (each: failing test first, then code)",
  "4. Risks / unknowns",
  "5. Out of scope for the first implement pass",
  "",
  "Original request:",
].join("\n");

const STUB_PLAN_RE =
  /\b(i('ll| will)|let me)\s+(review|inspect|check|look|draft|create|write|investigate)\b|\bthen draft\b|\bdraft (a |one )?(concise )?(whatsapp-ready )?plan\b/i;

export function isIncompletePlan(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 180 && STUB_PLAN_RE.test(trimmed)) return true;
  if (STUB_PLAN_RE.test(trimmed) && !/\b(goal|slices?|risks?|out of scope)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

export const PLAN_RETRY_PROMPT = [
  "Your previous message was not the plan — it was a status/promise.",
  "Output the complete WhatsApp plan NOW as your only message.",
  "Required sections: Goal, Specs, Ordered slices, Risks, Out of scope.",
  "Do not investigate further. Do not say you will draft a plan.",
].join(" ");

export function shouldPlanFirst(prompt: string): boolean {
  const text = prompt.trim();
  if (text.length >= 400) return true;

  const numbered = text.match(/^\s*\d+[\.)]\s+\S/gm);
  if (numbered && numbered.length >= 3) return true;

  if (/WhatsApp image is attached/i.test(text) && text.length >= 200) return true;

  return false;
}

export function wrapPromptForPlan(userPrompt: string): string {
  return `${PLAN_PREAMBLE}\n${userPrompt}`;
}

export { PLAN_PREAMBLE };

function normalize(text: string): string {
  const trimmed = text.trim();
  const body = trimmed.startsWith("/") ? trimmed.slice(1).trim() : trimmed;
  return body.replace(/\s+/g, " ").toLowerCase();
}

export function parsePlanApprovalIntent(text: string): PlanApprovalIntent | null {
  const normalized = normalize(text);

  if (
    normalized === "go" ||
    normalized === "implement" ||
    normalized === "do it" ||
    normalized === "ship it" ||
    normalized === "build it"
  ) {
    return { kind: "approve" };
  }

  if (
    normalized === "cancel plan" ||
    normalized === "nevermind plan" ||
    normalized === "never mind plan"
  ) {
    return { kind: "cancel" };
  }

  return null;
}

export function buildImplementPrompt(pending: {
  userPrompt: string;
  planText: string;
}): string {
  return [
    "Implement the approved plan below. Follow red → green → refactor.",
    "For multi-step work, launch tester / implementer / reviewer via the Task tool.",
    "",
    "## Approved plan",
    pending.planText.trim(),
    "",
    "## Original request",
    pending.userPrompt.trim(),
  ].join("\n");
}

export function formatPlanReply(planText: string): string {
  const body = planText.trim() || "(Plan was empty — try again or send a smaller task.)";
  return [
    body,
    "",
    "—",
    "Reply *go* to implement this plan, or *cancel plan* to drop it.",
  ].join("\n");
}
