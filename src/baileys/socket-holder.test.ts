import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearActive,
  getActive,
  sendTextWithRetry,
  setActive,
} from "./socket-holder.js";

describe("SocketHolder", () => {
  afterEach(() => {
    clearActive();
    vi.useRealTimers();
  });

  it("stores and returns the active socket", () => {
    const sock = { id: "a" } as never;
    setActive(sock);
    expect(getActive()).toBe(sock);
  });

  it("throws when no socket is active", () => {
    expect(() => getActive()).toThrow(/no active/i);
  });

  it("replaces the active socket on reconnect", () => {
    const first = { id: "1" } as never;
    const second = { id: "2" } as never;
    setActive(first);
    setActive(second);
    expect(getActive()).toBe(second);
  });
});

describe("sendTextWithRetry", () => {
  afterEach(() => {
    clearActive();
    vi.useRealTimers();
  });

  it("resolves the socket at send time, not capture time", async () => {
    const first = {
      sendMessage: vi.fn().mockRejectedValue(new Error("dead")),
    };
    const second = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    setActive(first as never);

    const promise = sendTextWithRetry("jid@s.whatsapp.net", "hello", {
      delayMs: 10,
      attempts: 2,
    });
    // reconnect swaps the socket before the retry
    setActive(second as never);
    await promise;

    expect(first.sendMessage).toHaveBeenCalledTimes(1);
    expect(second.sendMessage).toHaveBeenCalledTimes(1);
    expect(second.sendMessage).toHaveBeenCalledWith("jid@s.whatsapp.net", {
      text: "hello",
    });
  });

  it("retries after a short delay on send failure", async () => {
    vi.useFakeTimers();
    const sock = {
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("closed"))
        .mockResolvedValueOnce(undefined),
    };
    setActive(sock as never);

    const promise = sendTextWithRetry("jid@s.whatsapp.net", "hi", {
      delayMs: 500,
      attempts: 2,
    });
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(sock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("waits for a new socket when active was cleared during reconnect", async () => {
    vi.useFakeTimers();
    clearActive();

    const live = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    const promise = sendTextWithRetry("jid@s.whatsapp.net", "hi", {
      delayMs: 100,
      attempts: 4,
    });

    await vi.advanceTimersByTimeAsync(150);
    setActive(live as never);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(live.sendMessage).toHaveBeenCalledWith("jid@s.whatsapp.net", {
      text: "hi",
    });
  });

  it("rethrows if all attempts fail", async () => {
    vi.useFakeTimers();
    const sock = {
      sendMessage: vi.fn().mockRejectedValue(new Error("still dead")),
    };
    setActive(sock as never);

    const promise = sendTextWithRetry("jid@s.whatsapp.net", "hi", {
      delayMs: 50,
      attempts: 3,
    });
    const assertion = expect(promise).rejects.toThrow(/still dead/);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(sock.sendMessage).toHaveBeenCalledTimes(3);
  });
});
