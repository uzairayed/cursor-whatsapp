import { describe, expect, it } from "vitest";
import { extractCursorText } from "./extract-text.js";

describe("extractCursorText", () => {
  it("uses the json result field", () => {
    const stdout = JSON.stringify({
      type: "result",
      result: "final answer",
      session_id: "s1",
    });
    expect(extractCursorText(stdout).text).toBe("final answer");
    expect(extractCursorText(stdout).sessionId).toBe("s1");
  });

  it("prefers the longest assistant message when result is a short stub", () => {
    const longPlan = [
      "**Goal** Improve conversion",
      "**Slices**",
      "1. Hero CTA test",
      "2. Implement CTA",
      "3. Review",
      "**Risks** Mobile layout",
      "**Out of scope** Ads rewrite",
    ].join("\n");
    const stdout = [
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I'll look around first." }],
        },
        session_id: "s1",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: longPlan }],
        },
        session_id: "s1",
      }),
      JSON.stringify({
        type: "result",
        result: "I'll look around first.",
        session_id: "s1",
        usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    ].join("\n");

    const extracted = extractCursorText(stdout);
    expect(extracted.text).toBe(longPlan);
    expect(extracted.sessionId).toBe("s1");
    expect(extracted.usage?.outputTokens).toBe(2);
  });
});
