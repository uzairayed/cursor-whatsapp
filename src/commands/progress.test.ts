import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProgressHeartbeat,
  formatElapsed,
  formatProgressMessage,
} from "./progress.js";

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsed(45)).toBe("45s");
    expect(formatElapsed(90)).toBe("1m 30s");
    expect(formatElapsed(125)).toBe("2m 5s");
  });
});

describe("formatProgressMessage", () => {
  it("tells the user work is still going and how to cancel", () => {
    const msg = formatProgressMessage(90, "tagiser");
    expect(msg).toMatch(/still working/i);
    expect(msg).toMatch(/TAGISER/);
    expect(msg).toMatch(/1m 30s/);
    expect(msg).toMatch(/stop/i);
  });
});

describe("createProgressHeartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onTick on each interval until stopped", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const hb = createProgressHeartbeat({
      intervalMs: 1000,
      onTick: (elapsed) => {
        ticks.push(elapsed);
      },
    });

    vi.advanceTimersByTime(3000);
    hb.stop();
    vi.advanceTimersByTime(2000);

    expect(ticks.length).toBe(3);
  });

  it("uses a progressive interval schedule", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const hb = createProgressHeartbeat({
      intervalsMs: [1000, 2000, 5000],
      onTick: (elapsed) => {
        ticks.push(elapsed);
      },
    });

    vi.advanceTimersByTime(1000); // first tick at 1s
    expect(ticks.length).toBe(1);
    vi.advanceTimersByTime(2000); // second at +2s
    expect(ticks.length).toBe(2);
    vi.advanceTimersByTime(5000); // third at +5s
    expect(ticks.length).toBe(3);
    vi.advanceTimersByTime(5000); // repeats last interval
    expect(ticks.length).toBe(4);
    hb.stop();
  });
});
