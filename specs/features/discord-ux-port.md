# Feature: Port portable UX from Cursor_Disc

Status: **done**

Source: a sibling Discord bridge (`@cursor-bridge/core`)

## Goal

Bring Discord bridge UX improvements that are transport-agnostic into WhatsApp. Skip Discord-only surfaces (slash commands, guild channels, embeds, plan ✅ reactions, auto project channels).

## Keep WhatsApp-specific behavior

- Auto plan-first for large prompts (`--mode ask` + stub retry). Do **not** replace this with Discord's hold-then-`plan`/`run` gate.
- Orchestrate vs solo agent mode.
- WhatsApp formatting (`*bold*`, 4000-char split).

## Portable acceptance criteria

### 1. Ask mode (read-only Q&A)

- User can send `ask <question>` or `/ask <question>`.
- Bridge runs Cursor with `executionMode: "ask"` (no `--force`), skips plan-first.
- Working reply mentions ask mode.
- Help text documents ask mode.

### 2. Parallel agents across projects

- Up to **3** Cursor agents may run when they target **different** project directories.
- Same-directory prompts queue (cap 5 per directory).
- `status` lists busy projects and per-project queue depths when relevant.
- `stop` cancels the **current** project's run and clears that project's queue.
- `stop all` cancels every run and clears all queues.

### 3. Live progress steps

- Agent/ask/plan runs use `--output-format stream-json`.
- Tool/assistant stream events become short WhatsApp progress lines (throttled).
- Heartbeats still fire on the progressive schedule; steps do not spam every NDJSON line.

### 4. Quoted reply context

- When the user replies to a WhatsApp message, include the quoted text (and image/audio note if present) in the Cursor prompt.
- Plain messages without a quote are unchanged.

## Non-goals

- Discord slash commands, embeds, threads, project channels, plan emoji reactions.
- Changing the 15-minute timeout.
- Merging the two repos into a monorepo (separate follow-up).

## Source map (Cursor_Disc)

| Feature | Path |
|---|---|
| Ask mode router | `packages/core/src/commands/ask-mode.test.ts`, `router.ts` |
| Runner pool | `packages/core/src/cursor/runner-pool.ts` |
| Directory queues | `packages/core/src/commands/directory-queues.ts` |
| Stream progress | `packages/core/src/cursor/stream-progress.ts` |
| Progress board / heartbeat | `packages/core/src/commands/progress.ts` |
| Multi-agent status copy | `packages/core/src/commands/status-messages.ts` |
| Reply context | `packages/discord/src/reply-context.ts` (adapt for Baileys) |
