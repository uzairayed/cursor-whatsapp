import { describe, expect, it } from "vitest";
import {
  buildImplementPrompt,
  formatPlanReply,
  parsePlanApprovalIntent,
  shouldPlanFirst,
  wrapPromptForPlan,
} from "./plan-first.js";

describe("shouldPlanFirst", () => {
  it("is false for short single tasks", () => {
    expect(shouldPlanFirst("Fix the login redirect")).toBe(false);
  });

  it("is true when the prompt is long", () => {
    expect(shouldPlanFirst("x".repeat(400))).toBe(true);
  });

  it("is true for multi-item numbered lists", () => {
    const prompt = [
      "Priority list:",
      "1. Vipps payments are only reserved, not captured.",
      "2. Fix the webhook timeout.",
      "3. Add retries for failed captures.",
    ].join("\n");
    expect(shouldPlanFirst(prompt)).toBe(true);
  });

  it("is true for image + substantial caption", () => {
    const prompt = [
      "A WhatsApp image is attached. Open and inspect this file:",
      "/tmp/inbox/shot.jpg",
      "",
      "x".repeat(200),
    ].join("\n");
    expect(shouldPlanFirst(prompt)).toBe(true);
  });
});

describe("plan prompts and approval", () => {
  it("wraps a plan-only preamble", () => {
    const wrapped = wrapPromptForPlan("Do the priority list");
    expect(wrapped).toMatch(/plan/i);
    expect(wrapped).toMatch(/read-only|do not edit/i);
    expect(wrapped.trimEnd().endsWith("Do the priority list")).toBe(true);
  });

  it("parses go / implement approvals and cancel", () => {
    expect(parsePlanApprovalIntent("go")).toEqual({ kind: "approve" });
    expect(parsePlanApprovalIntent("implement")).toEqual({ kind: "approve" });
    expect(parsePlanApprovalIntent("do it")).toEqual({ kind: "approve" });
    expect(parsePlanApprovalIntent("ship it")).toEqual({ kind: "approve" });
    expect(parsePlanApprovalIntent("cancel plan")).toEqual({ kind: "cancel" });
    expect(parsePlanApprovalIntent("fix login")).toBeNull();
  });

  it("builds an implement prompt from the approved plan", () => {
    const prompt = buildImplementPrompt({
      userPrompt: "Priority list…",
      planText: "1. Capture Vipps\n2. Tests",
    });
    expect(prompt).toContain("Priority list…");
    expect(prompt).toContain("Capture Vipps");
    expect(prompt).toMatch(/approved plan/i);
  });

  it("formats the WhatsApp plan reply with a go cue", () => {
    const reply = formatPlanReply("## Plan\n- step one");
    expect(reply).toContain("step one");
    expect(reply).toMatch(/\*go\*/i);
  });
});
