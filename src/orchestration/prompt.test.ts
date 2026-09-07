import { describe, expect, it } from "vitest";
import { wrapPromptForAgent, wrapPromptForGeneral } from "./prompt.js";

describe("wrapPromptForAgent", () => {
  it("returns the raw prompt in solo mode", () => {
    const prompt = "Add a failing test for agent mode persistence";
    expect(wrapPromptForAgent(prompt, "solo")).toBe(prompt);
  });

  it("prefixes an orchestration preamble in orchestrate mode", () => {
    const prompt = "Add agent mode persistence";
    const wrapped = wrapPromptForAgent(prompt, "orchestrate");

    expect(wrapped).toContain(prompt);
    expect(wrapped.indexOf(prompt)).toBeGreaterThan(0);
    expect(wrapped).toMatch(/Task tool/i);
    expect(wrapped).toMatch(/implementer/i);
    expect(wrapped).toMatch(/tester/i);
    expect(wrapped).toMatch(/reviewer/i);
    expect(wrapped).toMatch(/specs\//i);
    expect(wrapped).toMatch(/red\s*→\s*green|failing test first/i);
  });

  it("keeps the user prompt as the final section", () => {
    const prompt = "Ship criterion B";
    const wrapped = wrapPromptForAgent(prompt, "orchestrate");
    expect(wrapped.trimEnd().endsWith(prompt)).toBe(true);
  });
});

describe("wrapPromptForGeneral", () => {
  it("keeps the user prompt as the final section", () => {
    const prompt = "What is the capital of France?";
    const wrapped = wrapPromptForGeneral(prompt);
    expect(wrapped.trimEnd().endsWith(prompt)).toBe(true);
    expect(wrapped.indexOf(prompt)).toBeGreaterThan(0);
  });

  it("describes a general-purpose WhatsApp chat", () => {
    const wrapped = wrapPromptForGeneral("hello");
    expect(wrapped).toMatch(/general[- ]purpose/i);
    expect(wrapped).toMatch(/whatsapp/i);
  });

  it("forbids skills, subagents, and TDD orchestration", () => {
    const wrapped = wrapPromptForGeneral("hello");
    expect(wrapped).toMatch(/no (skills|tester|implementer|reviewer|tdd|orchestrat)/i);
  });

  it("must not use the orchestrate TDD preamble", () => {
    const wrapped = wrapPromptForGeneral("hello");
    expect(wrapped).not.toMatch(/main orchestrator agent/i);
    expect(wrapped).not.toMatch(/Launch specialist subagents/i);
  });
});
