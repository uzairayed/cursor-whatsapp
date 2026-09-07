import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { ConversationManager } from "../conversation/index.js";
import { CursorRunner } from "./runner.js";

function fakeChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as ReturnType<typeof fakeChild>;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("CursorRunner executionMode", () => {
  afterEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it("passes --mode plan and omits --force in plan mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "cwa-plan-flag-"));
    mkdirSync(join(root, "proj"));
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const runner = new CursorRunner();
    const pending = runner.run({
      cursorBin: "cursor",
      workspace: join(root, "proj"),
      prompt: "plan this",
      projectKey: "proj",
      conversations: new ConversationManager(join(root, "history")),
      executionMode: "plan",
    });

    queueMicrotask(() => {
      child.stdout.emit(
        "data",
        Buffer.from(`${JSON.stringify({ type: "result", result: "ok", session_id: "s1" })}\n`)
      );
      child.emit("close", 0);
    });

    await pending;

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--mode");
    expect(args[args.indexOf("--mode") + 1]).toBe("plan");
    expect(args).toContain("stream-json");
    expect(args).not.toContain("--force");
  });

  it("keeps --force for normal agent runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "cwa-agent-flag-"));
    mkdirSync(join(root, "proj"));
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const runner = new CursorRunner();
    const pending = runner.run({
      cursorBin: "cursor",
      workspace: join(root, "proj"),
      prompt: "fix it",
      projectKey: "proj",
      conversations: new ConversationManager(join(root, "history")),
    });

    queueMicrotask(() => {
      child.stdout.emit(
        "data",
        Buffer.from(`${JSON.stringify({ type: "result", result: "ok", session_id: "s1" })}\n`)
      );
      child.emit("close", 0);
    });

    await pending;

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--force");
    expect(args).not.toContain("--mode");
  });
});
