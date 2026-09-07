import { describe, expect, it } from "vitest";
import {
  buildBusyStatusMessage,
  buildIdleStatusMessage,
  buildWorkingMessage,
} from "./status-messages.js";

describe("buildWorkingMessage", () => {
  it("sounds human and names the project clearly", () => {
    const msg = buildWorkingMessage("cliproom");
    expect(msg.toLowerCase()).toContain("cliproom");
    expect(msg).not.toMatch(/^Working on /);
    expect(msg).toMatch(/on it|looking into|working on that|got it/i);
    expect(msg).toMatch(/check in|stop/i);
  });
});

describe("status messages", () => {
  it("reports busy vs idle", () => {
    expect(buildBusyStatusMessage("tagiser")).toMatch(/TAGISER/);
    expect(buildBusyStatusMessage("tagiser")).toMatch(/still working/i);
    expect(buildIdleStatusMessage()).toMatch(/free/i);
  });
});
