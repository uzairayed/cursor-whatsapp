import { describe, expect, it, vi } from "vitest";
import { DirectoryQueues } from "./directory-queues.js";
import type { ReplyFn } from "./router.js";

function reply(): ReplyFn {
  return vi.fn(async () => undefined);
}

function item(prompt: string, workspace: string, projectKey = "crm") {
  return {
    prompt,
    reply: reply(),
    projectKey,
    workspace,
  };
}

describe("DirectoryQueues", () => {
  it("keeps separate FIFO queues per workspace", () => {
    const q = new DirectoryQueues(3);
    q.enqueue(item("a1", "/a"));
    q.enqueue(item("b1", "/b"));
    q.enqueue(item("a2", "/a"));

    expect(q.size("/a")).toBe(2);
    expect(q.size("/b")).toBe(1);
    expect(q.dequeue("/a")?.prompt).toBe("a1");
    expect(q.dequeue("/a")?.prompt).toBe("a2");
    expect(q.dequeue("/b")?.prompt).toBe("b1");
  });

  it("clear only affects one workspace", () => {
    const q = new DirectoryQueues(5);
    q.enqueue(item("a", "/a"));
    q.enqueue(item("b", "/b"));
    expect(q.clear("/a")).toBe(1);
    expect(q.size("/a")).toBe(0);
    expect(q.size("/b")).toBe(1);
  });

  it("findNextIdleQueue skips busy workspaces", () => {
    const q = new DirectoryQueues(5);
    q.enqueue(item("a", "/a"));
    q.enqueue(item("b", "/b"));

    const next = q.findNextIdleQueue((ws) => ws === "/a");
    expect(next?.workspace).toBe("/b");
    expect(q.size("/b")).toBe(0);
  });

  it("clearAll clears all workspaces", () => {
    const q = new DirectoryQueues(5);
    q.enqueue(item("a", "/a"));
    q.enqueue(item("b", "/b"));
    expect(q.clearAll()).toBe(2);
    expect(q.totalSize()).toBe(0);
  });

  it("respects per-directory cap", () => {
    const q = new DirectoryQueues(2);
    q.enqueue(item("a1", "/a"));
    q.enqueue(item("a2", "/a"));
    const result = q.enqueue(item("a3", "/a"));
    expect(result.ok).toBe(false);
  });

  it("queueDepths shows non-empty queues", () => {
    const q = new DirectoryQueues(5);
    q.enqueue(item("a1", "/a"));
    q.enqueue(item("a2", "/a"));
    q.enqueue(item("b1", "/b"));
    const depths = q.queueDepths();
    expect(depths).toEqual([
      { workspace: "/a", depth: 2 },
      { workspace: "/b", depth: 1 },
    ]);
  });
});
