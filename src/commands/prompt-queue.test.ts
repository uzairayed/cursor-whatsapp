import { describe, expect, it, vi } from "vitest";
import { PromptQueue } from "./prompt-queue.js";
import type { QueuedPrompt } from "./queued-prompt.js";

function item(prompt: string): QueuedPrompt {
  return {
    prompt,
    reply: vi.fn(async () => {}),
    projectKey: "crm",
    workspace: "/tmp/crm",
  };
}

describe("PromptQueue", () => {
  it("enqueues up to the cap and reports position", () => {
    const q = new PromptQueue(3);
    expect(q.enqueue(item("a"))).toEqual({ ok: true, position: 1 });
    expect(q.enqueue(item("b"))).toEqual({ ok: true, position: 2 });
    expect(q.enqueue(item("c"))).toEqual({ ok: true, position: 3 });
    expect(q.enqueue(item("d"))).toEqual({ ok: false, reason: "full" });
    expect(q.size).toBe(3);
  });

  it("drains FIFO", () => {
    const q = new PromptQueue(5);
    q.enqueue(item("first"));
    q.enqueue(item("second"));
    expect(q.dequeue()?.prompt).toBe("first");
    expect(q.dequeue()?.prompt).toBe("second");
    expect(q.dequeue()).toBeNull();
  });

  it("clear empties the queue", () => {
    const q = new PromptQueue(5);
    q.enqueue(item("a"));
    q.enqueue(item("b"));
    q.clear();
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });
});
