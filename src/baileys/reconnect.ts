const BASE_MS = 1000;
const CAP_MS = 60_000;
const JITTER_RATIO = 0.2;

/** Only reset backoff after the socket stayed open at least this long. */
export const STABLE_OPEN_MS = 60_000;

/** Wait this long after a 440 session conflict before retrying. */
export const CONFLICT_DELAY_MS = 180_000;

export const WA_STATUS = {
  loggedOut: 401,
  forbidden: 403,
  timedOut: 408,
  connectionLost: 408,
  multideviceMismatch: 411,
  connectionClosed: 428,
  connectionReplaced: 440,
  unavailableService: 503,
  restartRequired: 515,
} as const;

export type ReconnectAction = "retry" | "conflict" | "cooldown" | "reauth" | "stop";

export interface ReconnectDecision {
  action: ReconnectAction;
  delayMs: number;
  reason: string;
}

export interface ReconnectOptions {
  stableOpenMs?: number;
  conflictDelayMs?: number;
  stormCount?: number;
  stormWindowMs?: number;
  cooldownMs?: number;
}

/** Exponential backoff with optional jitter. attempt 0 → 1s, then 2s, 4s… capped at 60s. */
export function nextBackoffMs(
  attempt: number,
  random: () => number = Math.random
): number {
  const base = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(base * JITTER_RATIO * random());
  return base + jitter;
}

export class ReconnectController {
  private _attempt = 0;
  private isConnecting = false;
  private openedAt: number | null = null;
  private closeTimes: number[] = [];
  private readonly stableOpenMs: number;
  private readonly conflictDelayMs: number;
  private readonly stormCount: number;
  private readonly stormWindowMs: number;
  private readonly cooldownMs: number;

  constructor(
    private readonly random: () => number = Math.random,
    opts: ReconnectOptions = {}
  ) {
    this.stableOpenMs = opts.stableOpenMs ?? STABLE_OPEN_MS;
    this.conflictDelayMs = opts.conflictDelayMs ?? CONFLICT_DELAY_MS;
    this.stormCount = opts.stormCount ?? 8;
    this.stormWindowMs = opts.stormWindowMs ?? 120_000;
    this.cooldownMs = opts.cooldownMs ?? 900_000;
  }

  get attempt(): number {
    return this._attempt;
  }

  tryBeginConnect(): boolean {
    if (this.isConnecting) return false;
    this.isConnecting = true;
    return true;
  }

  endConnect(): void {
    this.isConnecting = false;
  }

  /** Mark the socket open. Does NOT reset backoff. That happens only after a stable session. */
  recordOpen(now: number = Date.now()): void {
    this.openedAt = now;
    this.isConnecting = false;
  }

  /**
   * Decide what to do after a disconnect.
   * Backoff only resets if the previous open lasted ≥ stableOpenMs (stops 1s flap storms).
   */
  decideAfterClose(
    statusCode: number | undefined,
    now: number = Date.now()
  ): ReconnectDecision {
    const openDuration = this.openedAt !== null ? now - this.openedAt : 0;
    const wasStable = this.openedAt !== null && openDuration >= this.stableOpenMs;
    this.openedAt = null;

    if (wasStable) this._attempt = 0;

    if (statusCode === WA_STATUS.loggedOut) {
      this._attempt = 0;
      this.closeTimes = [];
      return {
        action: "reauth",
        delayMs: 0,
        reason: "logged out. Clear auth and show QR",
      };
    }

    if (statusCode === WA_STATUS.forbidden) {
      return {
        action: "stop",
        delayMs: 0,
        reason: "forbidden (403). Not reconnecting. Check account / ban status",
      };
    }

    this.closeTimes.push(now);
    this.closeTimes = this.closeTimes.filter((t) => now - t <= this.stormWindowMs);

    if (this.closeTimes.length >= this.stormCount) {
      this.closeTimes = [];
      this._attempt = Math.max(this._attempt, 6);
      return {
        action: "cooldown",
        delayMs: this.cooldownMs,
        reason: `reconnect storm. Cooling down ${Math.round(this.cooldownMs / 1000)}s`,
      };
    }

    if (statusCode === WA_STATUS.connectionReplaced) {
      this._attempt = Math.max(this._attempt + 1, 3);
      return {
        action: "conflict",
        delayMs: this.conflictDelayMs,
        reason:
          "session conflict (440). Another client took the link. Waiting before retry",
      };
    }

    const delayMs = nextBackoffMs(this._attempt, this.random);
    this._attempt += 1;
    return {
      action: "retry",
      delayMs,
      reason: `closed (code: ${statusCode ?? "unknown"})`,
    };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
