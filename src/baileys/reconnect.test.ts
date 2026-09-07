import { describe, expect, it } from "vitest";
import {
  ReconnectController,
  nextBackoffMs,
  WA_STATUS,
} from "./reconnect.js";

describe("nextBackoffMs", () => {
  it("doubles from 1s up to a 60s cap", () => {
    expect(nextBackoffMs(0, () => 0)).toBe(1000);
    expect(nextBackoffMs(1, () => 0)).toBe(2000);
    expect(nextBackoffMs(2, () => 0)).toBe(4000);
    expect(nextBackoffMs(3, () => 0)).toBe(8000);
    expect(nextBackoffMs(10, () => 0)).toBe(60_000);
  });

  it("adds jitter up to 20% of the base delay", () => {
    expect(nextBackoffMs(0, () => 1)).toBe(1200);
    expect(nextBackoffMs(1, () => 0.5)).toBe(2200);
  });
});

describe("ReconnectController", () => {
  it("blocks overlapping connect attempts (single-flight)", () => {
    const ctrl = new ReconnectController();
    expect(ctrl.tryBeginConnect()).toBe(true);
    expect(ctrl.tryBeginConnect()).toBe(false);
    ctrl.endConnect();
    expect(ctrl.tryBeginConnect()).toBe(true);
  });

  it("does not reset backoff after a flappy open (under stable threshold)", () => {
    const ctrl = new ReconnectController(() => 0);
    // First close → attempt advances
    expect(ctrl.decideAfterClose(WA_STATUS.timedOut, 0).delayMs).toBe(1000);
    expect(ctrl.attempt).toBe(1);

    // Brief open then close. Must NOT reset to 1s
    ctrl.recordOpen(1_000);
    const decision = ctrl.decideAfterClose(WA_STATUS.timedOut, 1_000 + 5_000);
    expect(decision.action).toBe("retry");
    expect(decision.delayMs).toBe(2000);
    expect(ctrl.attempt).toBe(2);
  });

  it("resets backoff only after a stable open", () => {
    const ctrl = new ReconnectController(() => 0);
    ctrl.decideAfterClose(WA_STATUS.timedOut, 0);
    ctrl.decideAfterClose(WA_STATUS.timedOut, 1_000);
    expect(ctrl.attempt).toBe(2);

    ctrl.recordOpen(10_000);
    const decision = ctrl.decideAfterClose(
      WA_STATUS.connectionClosed,
      10_000 + 60_000
    );
    expect(decision.action).toBe("retry");
    expect(decision.delayMs).toBe(1000);
    expect(ctrl.attempt).toBe(1);
  });

  it("waits a long conflict delay on 440 instead of 1s retry", () => {
    const ctrl = new ReconnectController(() => 0);
    const decision = ctrl.decideAfterClose(WA_STATUS.connectionReplaced, 0);
    expect(decision.action).toBe("conflict");
    expect(decision.delayMs).toBeGreaterThanOrEqual(120_000);
  });

  it("stops reconnecting on forbidden (403)", () => {
    const ctrl = new ReconnectController(() => 0);
    const decision = ctrl.decideAfterClose(WA_STATUS.forbidden, 0);
    expect(decision.action).toBe("stop");
  });

  it("requests reauth on logged out", () => {
    const ctrl = new ReconnectController(() => 0);
    const decision = ctrl.decideAfterClose(WA_STATUS.loggedOut, 0);
    expect(decision.action).toBe("reauth");
  });

  it("enters cooldown after a reconnect storm", () => {
    const ctrl = new ReconnectController(() => 0, {
      stormCount: 5,
      stormWindowMs: 60_000,
      cooldownMs: 300_000,
    });

    let last = ctrl.decideAfterClose(WA_STATUS.timedOut, 0);
    for (let i = 1; i < 5; i++) {
      last = ctrl.decideAfterClose(WA_STATUS.timedOut, i * 1_000);
    }
    expect(last.action).toBe("cooldown");
    expect(last.delayMs).toBe(300_000);
  });
});
