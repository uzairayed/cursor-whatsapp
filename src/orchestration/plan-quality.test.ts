import { describe, expect, it } from "vitest";
import { isIncompletePlan, wrapPromptForPlan } from "./plan-first.js";

describe("isIncompletePlan", () => {
  it("flags promise-to-plan stubs", () => {
    expect(
      isIncompletePlan(
        "I'll review the current homepage hero, icon section, and PageSpeed-related assets, then draft one concise WhatsApp-ready plan covering all four items."
      )
    ).toBe(true);
    expect(
      isIncompletePlan("I'll inspect the homepage hero and draft a concise plan.")
    ).toBe(true);
  });

  it("accepts a real structured plan", () => {
    const plan = [
      "**Goal**",
      "Improve homepage conversion.",
      "",
      "**Slices**",
      "1. Failing test for hero CTA",
      "2. Implement CTA button",
      "",
      "**Risks**",
      "Copy/layout regressions on mobile.",
      "",
      "**Out of scope**",
      "Full funnel analytics rewrite.",
    ].join("\n");
    expect(isIncompletePlan(plan)).toBe(false);
  });
});

describe("wrapPromptForPlan", () => {
  it("requires the final message to be the plan itself", () => {
    const wrapped = wrapPromptForPlan("Do the four items");
    expect(wrapped).toMatch(/final message/i);
    expect(wrapped).toMatch(/not a promise/i);
    expect(wrapped).toContain("Do the four items");
  });
});
