import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_MODE,
  formatAgentModeReply,
  parseAgentMode,
  parseAgentModeIntent,
  type AgentMode,
} from "./mode.js";

describe("parseAgentMode", () => {
  it("defaults to orchestrate when missing or unknown", () => {
    expect(parseAgentMode(undefined)).toBe("orchestrate");
    expect(parseAgentMode(null)).toBe("orchestrate");
    expect(parseAgentMode("")).toBe("orchestrate");
    expect(parseAgentMode("nope")).toBe("orchestrate");
    expect(DEFAULT_AGENT_MODE).toBe("orchestrate");
  });

  it("accepts orchestrate and solo", () => {
    expect(parseAgentMode("orchestrate")).toBe("orchestrate");
    expect(parseAgentMode("solo")).toBe("solo");
    expect(parseAgentMode("ORCHESTRATE")).toBe("orchestrate");
  });
});

describe("parseAgentModeIntent", () => {
  it("sets orchestrate from conversational phrases", () => {
    const phrases = [
      "orchestrate",
      "/orchestrate",
      "multi agent",
      "use agents",
      "Multi Agent please",
    ];
    for (const raw of phrases) {
      expect(parseAgentModeIntent(raw), raw).toEqual({
        kind: "set",
        mode: "orchestrate" satisfies AgentMode,
      });
    }
  });

  it("sets solo from conversational phrases", () => {
    const phrases = ["solo", "/solo", "single agent", "no agents"];
    for (const raw of phrases) {
      expect(parseAgentModeIntent(raw), raw).toEqual({
        kind: "set",
        mode: "solo",
      });
    }
  });

  it("queries current mode", () => {
    for (const raw of ["agent mode", "which mode", "/agent mode"]) {
      expect(parseAgentModeIntent(raw), raw).toEqual({ kind: "query" });
    }
  });

  it("ignores normal prompts", () => {
    expect(parseAgentModeIntent("fix the login bug")).toBeNull();
    expect(parseAgentModeIntent("projects")).toBeNull();
  });
});

describe("formatAgentModeReply", () => {
  it("confirms a mode change", () => {
    expect(formatAgentModeReply("orchestrate", "set")).toMatch(/orchestrate/i);
    expect(formatAgentModeReply("solo", "set")).toMatch(/solo/i);
  });

  it("reports the current mode", () => {
    expect(formatAgentModeReply("orchestrate", "query")).toMatch(/orchestrate/i);
    expect(formatAgentModeReply("solo", "query")).toMatch(/solo/i);
  });
});
