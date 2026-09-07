# Feature: Plan-first for large prompts

Status: **done** (bridge plan-first + go approval; ask-mode text plans after stub fix)

## Problem

A multi-item priority list (Vipps capture + screenshot) ran in `orchestrate` agent mode, hit the 15-minute timeout (`exit=143`, `timed_out`), and returned no useful answer. Large prompts should plan before coding.

## Goal

For large / multi-item WhatsApp tasks, the bridge first runs Cursor in **`--mode plan`** (read-only). The plan is sent to WhatsApp. The user replies **`go`** (or similar) to run implementation with the approved plan.

## Behavior

### Size heuristic (`shouldPlanFirst`)

Treat a prompt as large when any is true:

- length ≥ 400 characters, or
- ≥ 3 numbered list items (`1. …` / `1) …`), or
- WhatsApp image attached **and** body length ≥ 200

### Auto plan-first

When `shouldPlanFirst(prompt)` is true (and there is no pending plan being approved):

1. Spawn Cursor with `--mode ask` (read-only, no `--force`). Do not use CLI `--mode plan`, which often hides the real plan in a UI artifact and only returns a short "I'll draft..." stub
2. Start a **fresh** session (`resume=false`) with a plan-only preamble that requires the final message to *be* the plan
3. Use `--output-format stream-json` and prefer the longest assistant message when the terminal result is a stub
4. If the reply still looks like a stub, retry once with a "print the plan now" prompt (`resume=true`)
5. On success, store a pending plan in `state.json` and reply with the plan plus: reply *go* to implement
6. Log `cursorMode=ask` in the start line

Small prompts keep today’s path (orchestrate preamble + agent run with `--force`).

### Approval

| Intent | Examples | Result |
|---|---|---|
| Approve | `go`, `implement`, `do it`, `ship it` | Agent run using original prompt + approved plan |
| Cancel | `cancel plan`, `nevermind plan` | Clear pending plan |
| New large prompt | another large task | Replaces pending plan after a new plan run |

Approval runs use normal agent mode (`--force`), orchestration preamble when `agentMode=orchestrate`, and clear the pending plan when the implement run starts.

**Critical:** Approve/implement must start a **fresh** Cursor session (`resume=false`). The plan phase used `--mode ask`; resuming that session leaves Cursor stuck in read-only ask mode even if the bridge requests agent.

### Non-goals

- Persistent third mode beside orchestrate/solo (plan is a phase, not a mode)
- Auto-implement after plan without user approval
- Changing the 15-minute timeout in this slice
