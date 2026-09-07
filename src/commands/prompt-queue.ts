import type { QueuedPrompt } from "./queued-prompt.js";

export type EnqueueResult =
  | { ok: true; position: number }
  | { ok: false; reason: "full" };

export class PromptQueue {
  private readonly items: QueuedPrompt[] = [];

  constructor(private readonly maxSize: number) {}

  get size(): number {
    return this.items.length;
  }

  enqueue(item: QueuedPrompt): EnqueueResult {
    if (this.items.length >= this.maxSize) {
      return { ok: false, reason: "full" };
    }
    this.items.push(item);
    return { ok: true, position: this.items.length };
  }

  dequeue(): QueuedPrompt | null {
    return this.items.shift() ?? null;
  }

  enqueueFront(item: QueuedPrompt): void {
    this.items.unshift(item);
  }

  clear(): void {
    this.items.length = 0;
  }
}
