# Feature: Multi-agent orchestrator

Status: **in progress** (hierarchy + mode/prompt bridge wired; specialists via Cursor Task)

## Goal

Allowlisted WhatsApp users send a software task. The bridge starts **one main Cursor agent** that plans the work against a written spec and **launches specialist subagents** (implementer, tester, reviewer) to finish it via spec-driven TDD.

## Architecture (accepted)

```text
WhatsApp → MessageRouter → CursorRunner (1 process)
                              └─ main agent (orchestrator)
                                   ├─ Task → implementer
                                   ├─ Task → tester
                                   └─ Task → reviewer
```

- Keep the existing global single-active-run + FIFO queue.
- Do **not** spawn multiple top-level `cursor agent` processes from the bridge.
- Use Cursor’s native Task / subagent tooling inside the main session.
- Specialist prompts live in `.cursor/agents/`; role contracts live in `specs/agents/`.

## Modes

| Mode | Default | Behavior |
|---|---|---|
| `orchestrate` | yes | Main agent must break multi-step work into subagent Tasks; follow TDD |
| `solo` | no | Main agent does the work inline (legacy single-agent behavior) |

Conversational toggles (case-insensitive, slash optional):

- `orchestrate`, `multi agent`, `use agents` → set mode `orchestrate`
- `solo`, `single agent`, `no agents` → set mode `solo`
- `agent mode`, `which mode` → report current mode

Mode is global (shared by all allowlisted users), persisted in `state.json` as `agentMode`.

## Acceptance criteria

### A. Spec hierarchy exists

- [x] `specs/README.md` documents the loop and multi-agent model
- [x] `specs/features/multi-agent-orchestrator.md` is this file
- [x] `specs/agents/{orchestrator,implementer,tester,reviewer}.md` define role contracts
- [x] `.cursor/agents/{orchestrator,implementer,tester,reviewer}.md` are Cursor-loadable agents
- [x] `.cursor/rules/spec-driven-tdd.mdc` enforces TDD for this workspace

### B. Mode persistence

- [x] `state.json` stores `agentMode: "orchestrate" | "solo"`
- [x] Default when missing is `orchestrate`
- [x] Conversational toggles update mode and confirm in WhatsApp
- [x] Mode query reports the current value

### C. Prompt wrapping

- [x] In `orchestrate` mode, every Cursor prompt is prefixed with an orchestration preamble that:
  - requires reading relevant `specs/` when present in the workspace
  - requires launching specialist subagents via the Task tool for implementation / tests / review when the task is multi-step
  - requires red → green → refactor (no production code without a failing test first)
  - names the specialist agents: `implementer`, `tester`, `reviewer`
- [x] In `solo` mode, the preamble is omitted (raw user prompt only)
- [x] Slash / control commands never receive the preamble

### D. WhatsApp UX

- [x] Help text mentions orchestrate vs solo
- [x] Progress / status wording stays accurate (still one top-level Cursor run)
- [x] `stop` / `stop all` still terminate the main Cursor process (subagents die with it)

### E. Non-goals (this feature)

- Bridge-level process pool of N `cursor agent` CLIs
- Per-user agent mode
- Discord transport (see `docs/DISCORD_BOT_PLAN.md`)
- Automatically writing feature specs for the *target* project (main agent may create them when asked)

## Test plan (bridge)

1. Unit: default mode + persistence round-trip
2. Unit: intent parsing for mode toggles / query
3. Unit: preamble included only in orchestrate mode for normal prompts
4. Unit: commands (`help`, `stop`, project pick) do not get the preamble
5. Router integration (mocked CursorRunner): orchestrate path passes wrapped prompt

## Open decisions

None for v1 — Cursor-native subagents inside one main process is the chosen path.
