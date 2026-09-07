import type { WASocket } from "@whiskeysockets/baileys";

let active: WASocket | null = null;

export function setActive(sock: WASocket): void {
  active = sock;
}

export function getActive(): WASocket {
  if (!active) throw new Error("No active WhatsApp socket");
  return active;
}

export function clearActive(): void {
  active = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForActive(timeoutMs: number): Promise<WASocket> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (active) return active;
    await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
  }
  if (active) return active;
  throw new Error("No active WhatsApp socket");
}

/**
 * Send text, retrying across reconnect gaps.
 * Resolves the active socket on every attempt so a reconnected sock is used.
 */
export async function sendTextWithRetry(
  jid: string,
  text: string,
  opts: { delayMs?: number; attempts?: number } = {}
): Promise<void> {
  const delayMs = opts.delayMs ?? 1500;
  const attempts = opts.attempts ?? 5;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const sock = await waitForActive(delayMs);
      await sock.sendMessage(jid, { text });
      return;
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      await sleep(delayMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
