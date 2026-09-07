# Feature: Per-sender session isolation + smart history

Status: **done**

Related: `casual-general-access.md`, token footers in `usage.ts`

## Problem

1. Casual numbers already get `sessionKey = general__wa:<phone>` on the happy path, but **queued** runs (same `general/` workspace busy) drop `sessionKey`. Dequeued prompts fall back to storage key `general`, so different numbers can resume/overwrite one shared Cursor session.
2. Fresh casual turns still burn ~20k input tokens because casual chat runs under global **orchestrate** mode (TDD/Task preamble) even for "hi".
3. Long project sessions balloon (100k+ input tokens) via `--resume`; users must remember `new chat`. We should auto-rotate when the last turn was already huge.

## Goal

- Every sender’s Cursor chat stays isolated end-to-end (including queue / ask / plan-approve paths).
- Casual chat stays light (solo agent wrapping).
- Auto-start a fresh Cursor thread when the previous turn’s input tokens crossed a threshold; tell the user briefly.

## Behavior

### Session key through the queue

- `QueuedRunOptions` / enqueue paths must carry `sessionKey` (and `resume` when set).
- `runQueuedPrompt` and the acquire-fail re-queue inside `runPrompt` must forward `sessionKey`.
- Casual ask / go / normal prompt queueing must not drop the namespaced key.

### Conversation key fallback

- Prefer `wa:<phone>` when phone resolves.
- If phone is missing but we still authorized via some identifier, use a stable lid-based key (`lid:<jid>`) so we never share the bare `general` key across senders.

### Casual = solo wrapping

- Casual prompts always wrap with `solo` agent mode (no orchestration preamble), regardless of the owner's global agent-mode setting.
- Owners keep their configured orchestrate/solo mode.

### Smart history rotation

- Persist `lastInputTokens` on conversation state when a run reports usage.
- Before `--resume`, if `lastInputTokens >= AUTO_FRESH_INPUT_TOKENS` (default **80_000**), clear the stored chat id and run with `resume=false`.
- Reply once (or append a one-liner) that the chat was reset to save tokens; user can still say `new chat` manually anytime.
- Existing warn footer at 100k remains; auto-fresh is the proactive fix.

## Non-goals

- Parallel Cursor runs against the same `general/` directory (workspace lock stays).
- Per-owner isolation on real project paths (owners still share project session keys unless a conversation override is passed).
- Changing Cursor's own context window or model.

## Acceptance tests (minimum)

1. When `general/` is busy and a casual prompt is queued, the dequeued run still uses `sessionKey = general__wa:<phone>`.
2. Two casual phones never write chat ids under the bare `general` storage key via the queue path.
3. Casual runs pass prompts without the orchestration preamble (solo wrap).
4. After a turn with `inputTokens >= 80_000`, the next turn for that storage key starts fresh (`resume=false`, chat id cleared).
5. Owner project runs still use project key as session storage when no conversation override is set.
