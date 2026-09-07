/** Default progressive schedule: 45s, then 2m, then every 5m. */
export const PROGRESS_INTERVALS_MS = [45_000, 120_000, 300_000] as const;

/** @deprecated prefer PROGRESS_INTERVALS_MS */
export const PROGRESS_INTERVAL_MS = PROGRESS_INTERVALS_MS[0];

export function formatElapsed(elapsedSec: number): string {
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function formatProgressMessage(elapsedSec: number, projectKey: string): string {
  return `Still working in *${projectKey.toUpperCase()}*... (${formatElapsed(elapsedSec)}). Say *stop* to cancel.`;
}

export function createProgressHeartbeat(opts: {
  /** Fixed interval (legacy). Ignored when intervalsMs is set. */
  intervalMs?: number;
  /** Progressive schedule; last value repeats. */
  intervalsMs?: readonly number[];
  onTick: (elapsedSec: number) => void | Promise<void>;
}): { stop: () => void } {
  const started = Date.now();
  const schedule =
    opts.intervalsMs && opts.intervalsMs.length > 0
      ? [...opts.intervalsMs]
      : [opts.intervalMs ?? PROGRESS_INTERVAL_MS];

  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    void opts.onTick(elapsedSec);
    index += 1;
    const nextDelay = schedule[Math.min(index, schedule.length - 1)]!;
    timer = setTimeout(tick, nextDelay);
  };

  timer = setTimeout(tick, schedule[0]!);

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
