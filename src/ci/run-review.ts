#!/usr/bin/env npx tsx
/**
 * Self-hosted CI entry: local Cursor login (no CURSOR_API_KEY) → PR comment.
 *
 * Expected env (set by GitHub Actions):
 *   PR_NUMBER, PR_TITLE, PR_BASE_REF, PR_HEAD_REF
 *   GH_TOKEN or GITHUB_TOKEN (for gh pr diff / comment)
 * Optional:
 *   CURSOR_BIN (default: cursor)
 *   CURSOR_TIMEOUT_MIN (default: 15)
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCiReviewPrompt } from "./review-prompt.js";
import { extractCursorText } from "../cursor/extract-text.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

function runGh(args: string[]): string {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `gh ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function main(): void {
  if (process.env.CURSOR_API_KEY) {
    console.warn(
      "CURSOR_API_KEY is set; this workflow is intended to use local agent login instead.",
    );
  }

  const prNumber = Number(requireEnv("PR_NUMBER"));
  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    console.error("PR_NUMBER must be a positive integer");
    process.exit(1);
  }

  const title = process.env.PR_TITLE?.trim() || `PR #${prNumber}`;
  const baseRef = process.env.PR_BASE_REF?.trim() || "main";
  const headRef = process.env.PR_HEAD_REF?.trim() || "HEAD";
  const cursorBin = process.env.CURSOR_BIN?.trim() || "cursor";
  const timeoutMin = Math.max(1, Number(process.env.CURSOR_TIMEOUT_MIN || "15"));
  const timeoutMs = timeoutMin * 60 * 1000;
  const workspace = process.cwd();

  const diff = runGh(["pr", "diff", String(prNumber)]);
  const prompt = buildCiReviewPrompt({
    prNumber,
    title,
    baseRef,
    headRef,
    diff,
  });

  // stream-json matches CursorRunner ask/plan mode so extractCursorText can
  // recover longer assistant bodies when the terminal result is a stub.
  const args = [
    "agent",
    "-p",
    "--trust",
    "--mode",
    "ask",
    "--output-format",
    "stream-json",
    "--workspace",
    workspace,
    prompt,
  ];

  console.log(`Running ${cursorBin} agent (ask) for PR #${prNumber}…`);
  const cursor = spawnSync(cursorBin, args, {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 32 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (cursor.error) {
    console.error(cursor.error.message);
    process.exit(1);
  }
  if (cursor.status !== 0) {
    console.error(cursor.stderr || cursor.stdout || `Cursor exited ${cursor.status}`);
    process.exit(cursor.status ?? 1);
  }

  const extracted = extractCursorText(cursor.stdout || "");
  const body =
    extracted.text.trim() ||
    cursor.stdout.trim() ||
    "_Cursor returned an empty review._";

  const comment = [
    "<!-- cursor-self-hosted-review -->",
    "## Cursor review (self-hosted)",
    "",
    body,
  ].join("\n");

  const dir = mkdtempSync(join(tmpdir(), "cursor-review-"));
  const bodyFile = join(dir, "comment.md");
  try {
    writeFileSync(bodyFile, comment, "utf8");
    runGh(["pr", "comment", String(prNumber), "--body-file", bodyFile]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`Posted review comment on PR #${prNumber}`);
}

main();
