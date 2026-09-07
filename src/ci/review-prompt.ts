export interface CiReviewPromptInput {
  prNumber: number;
  title: string;
  baseRef: string;
  headRef: string;
  diff: string;
  /** Soft cap for embedding the diff in the prompt. Default 120_000. */
  maxDiffChars?: number;
}

const DEFAULT_MAX_DIFF_CHARS = 120_000;

export function buildCiReviewPrompt(input: CiReviewPromptInput): string {
  const maxDiffChars = input.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS;
  let diff = input.diff;
  let truncatedNote = "";

  if (diff.length > maxDiffChars) {
    diff = diff.slice(0, maxDiffChars);
    truncatedNote =
      "\n\n[diff truncated. Review what is shown. Say that the full diff was too large to embed]\n";
  }

  return [
    "You are the reviewer specialist for a GitHub pull request.",
    "Follow specs/agents/reviewer.md when that file exists in the workspace.",
    "",
    "Rules:",
    "- Read-only review. Do not edit, rewrite, or modify any files.",
    "- Diff the change against acceptance criteria in specs/features/* when present.",
    "- Run relevant tests if you can; otherwise list the exact commands that should be run.",
    "- Report pass/fail per criterion, blockers, and optional follow-ups.",
    "- Output a structured review suitable for a GitHub PR comment:",
    "  criteria checklist, test commands run (or recommended), blockers, follow-ups.",
    "",
    `PR #${input.prNumber}: ${input.title}`,
    `Base: ${input.baseRef}`,
    `Head: ${input.headRef}`,
    "",
    "Diff:",
    "```diff",
    diff,
    "```",
    truncatedNote,
  ].join("\n");
}
