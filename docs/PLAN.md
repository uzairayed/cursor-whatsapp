# Improvement Plan: WhatsApp to Cursor Agent Bridge

Based on a full source audit (typecheck clean, 64/64 tests passing) and review of the
live bridge logs. Four phases, ordered by risk reduction per effort. Each item is
small and independently shippable. Every phase ends with `npm run typecheck && npm test`.

## Phase 1: Reliability fixes (live log shows all of these biting)

### 1.1 Route replies through the active socket
- Add a `SocketHolder` module with `getActive(): WASocket` and `setActive(sock)`,
  updated in `connect()` when a connection opens.
- Change the `reply` closure in `src/baileys/client.ts` to resolve the socket at
  send time, not capture it. Today, a connection drop (codes 408/428/503 happen
  constantly) during a 2-5 min Cursor run means the final answer is sent to a dead
  socket and silently lost.
- On send failure, retry once after a short delay (covers the reconnect window).
- Tests: unit test the holder + retry logic with a fake socket.

### 1.2 Fix the SIGKILL fallback in `CursorRunner.stop()`
- `proc.killed` is true as soon as SIGTERM is *sent*, not when the process exits,
  so the SIGKILL fallback in `src/cursor/runner.ts` never fires and a hung Cursor
  process wedges the whole bridge.
- Replace `if (!proc.killed)` with `if (proc.exitCode === null && proc.signalCode === null)`.
- Test: fake child object asserting SIGKILL fires when the process hasn't exited.

### 1.3 Reconnect backoff + single-flight connect
- Exponential backoff with jitter (1s → 2s → 4s … cap 60s), reset on successful open.
- An `isConnecting` guard so overlapping `close` events can't spawn two sockets.

### 1.4 Run timeout
- New env `CURSOR_TIMEOUT_MIN` (default 15). Timer inside `CursorRunner.run()` that
  triggers the same kill path and resolves with a `timedOut` flag.
- Router replies: "That took too long, so I stopped it. Try a smaller task."
- Tests: timer-based unit test with fake timers.

## Phase 2: Safety and correctness

### 2.1 Fail-closed allowlist
- If `allowedNumbers` is empty, exit at startup with a clear message instead of
  letting any sender drive Cursor with `--force --trust`.

### 2.2 Prompt queue
- Replace the "I'm still working" rejection with a small FIFO (cap ~5): enqueue,
  reply "Queued. 1 task ahead", drain after each run.
- "stop" cancels the current run; new "stop all" also clears the queue.

### 2.3 Reload `projects.json` on demand
- Call `projects.reload()` whenever the picker is rendered and on every
  project-switch attempt, so edits apply without a restart.

### 2.4 Code cleanup
- Dedupe the `TokenUsage` interface (currently defined in both `cursor/runner.ts`
  and `commands/usage.ts`) into one module.
- Remove the dead `handleCommand` deprecated alias.

## Phase 3: UX (highest value first)

### 3.1 Quieter progress
- Progressive heartbeat intervals (45s, then 2m, then every 5m). Change
  `createProgressHeartbeat` to take an interval schedule instead of a fixed interval.

### 3.2 Reaction acks
- React 👀 to the incoming message instead of sending the "On it. Working in..."
  text bubble; keep the text ack only when a queue position needs communicating.
- Needs the message key threaded through to the router (small signature change).

### 3.3 Voice notes
- Detect `audioMessage`, download like images, transcribe via OpenAI Whisper API
  (`OPENAI_API_KEY` env; skip the feature gracefully if unset).
- Feed the transcript as the prompt, prefixed with "(voice note)".
- Largest single item in the plan.

### 3.4 Housekeeping on startup
- Delete `history/inbox/` files and `logs/*.jsonl` older than 7 days (configurable).

## Phase 4: Docs

- Fix README drift: `auth/` → `auth_info/`.
- Replace the slash-command table with the actual conversational commands.
- Document new envs (`CURSOR_TIMEOUT_MIN`, `OPENAI_API_KEY`, retention).

## Deliberately out of scope (for now)

- **Per-sender sessions**: all allowed numbers currently share one project/session
  state. The real fix is a bigger refactor of `ProjectStore`/`ConversationManager`
  keying; the pragmatic mitigation is 2.1 plus trimming the allowlist. Follow-up
  item if multiple users are actually wanted.
- **Sending images back**: needs a protocol for the agent to hand files to the
  bridge (e.g. a magic output marker); worth designing separately.

## Execution order

1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1 → 3.2 → 3.4 → 3.3 → docs.

Restart the dev process once at the end so the running session isn't disturbed mid-way.
