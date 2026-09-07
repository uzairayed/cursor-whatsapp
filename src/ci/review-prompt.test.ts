import { describe, expect, it } from "vitest";
import { buildCiReviewPrompt } from "./review-prompt.js";

describe("buildCiReviewPrompt", () => {
  it("embeds PR metadata, diff, and reviewer contract rules", () => {
    const prompt = buildCiReviewPrompt({
      prNumber: 42,
      title: "Add queue drain",
      baseRef: "main",
      headRef: "feat/queue",
      diff: "diff --git a/src/x.ts b/src/x.ts\n+export const x = 1;\n",
    });

    expect(prompt).toMatch(/specs\/agents\/reviewer\.md/);
    expect(prompt).toMatch(/PR #42/);
    expect(prompt).toMatch(/Add queue drain/);
    expect(prompt).toMatch(/main/);
    expect(prompt).toMatch(/feat\/queue/);
    expect(prompt).toContain("diff --git a/src/x.ts");
    expect(prompt).toMatch(/do not (edit|rewrite|modify)/i);
    expect(prompt).toMatch(/criteria checklist/i);
  });

  it("truncates oversized diffs with a clear marker", () => {
    const huge = "x".repeat(200_000);
    const prompt = buildCiReviewPrompt({
      prNumber: 1,
      title: "big",
      baseRef: "main",
      headRef: "big",
      diff: huge,
      maxDiffChars: 1000,
    });

    expect(prompt.length).toBeLessThan(huge.length);
    expect(prompt).toMatch(/\[diff truncated/i);
  });
});
