# Feature: Casual numbers, general-only chat

Status: **done**

Source inspiration: Cursor_Disc built-in `general/` workspace + GENERAL surface.

## Problem

Some WhatsApp numbers should be allowed to chat with Cursor casually, but must not see or switch into real code projects.

## Goal

- Owners (`ALLOWED_NUMBERS`) keep full project access.
- Casual numbers (`CASUAL_NUMBERS`) may only use the local `general/` scratch workspace.
- Casual senders get their own Cursor sessions (not shared with each other or with the owner's general chat).

## Behavior

### Config

| Variable | Role |
|---|---|
| `ALLOWED_NUMBERS` | Full owners (required to start, unchanged) |
| `CASUAL_NUMBERS` | Optional comma-separated phones; general-only |

- Digits-only parsing matches owners.
- If a number appears in both lists, **owner wins**.
- Startup still requires at least one owner. Casual-only is not enough.

### Built-in `general` workspace

- Config includes `generalDir` → `<repo>/general` (created on demand).
- `ProjectStore` always exposes project key `general` pointing at that folder (aliases in `projects.json` may override the path).

### Authorization

1. Owner phone: full access (today's behavior).
2. Casual phone: accept message, lock to `general`.
3. Anyone else: ignore (no reply), same as today.

### Casual UX

- Always run prompts against `general` (do **not** change the owner's `currentProject` in `state.json`).
- Help / greetings: general-only copy (no project picker, no switch/orchestrate tips).
- `switch to ...`, bare project names, numbered picker, `projects`: refuse with a short "This is casual chat. You can't pick a project here." message.
- `ask …`, `status`, `stop`, `new chat`, plan/go still work within general.
- Session storage key: `general__wa:<phone>` so each casual number has an isolated Cursor chat.
- Runner `sessionKey` must support that namespaced key (workspace path remains `generalDir`).
- Casual / `general` prompts use a **general-chat preamble** (not the orchestrate TDD preamble): treat as normal Q&A, no skills, no tester/implementer/reviewer, do not mention skipping TDD.
- `general/AGENTS.md` reinforces the same rules for the Cursor workspace.

### Owner UX

- Unchanged for real projects, except `general` appears in the project picker and can be selected like any other project.
- Owner sessions for `general` stay keyed as `general` when no conversation override is passed.
- When the current project is `general`, prompts use the same general-chat preamble (never the orchestrate TDD preamble).
- Orchestrate / solo / "which mode" are **not available** in casual chat or when the current project is `general`. Reply that general chat does not use agent modes (global mode is left unchanged).

## Non-goals

- Per-owner multi-device project state
- Discord channels / surfaces
- Letting casual numbers use `--force` on real project paths
- Replacing owner allowlist with casual-only startup

## Acceptance tests (minimum)

1. `CASUAL_NUMBERS` parsed; overlap with owners → owner role.
2. Unauthorized + casual + owner authorization matrix.
3. `general` always present in ProjectStore.
4. Casual handle runs against `generalDir` without mutating `currentProject`.
5. Casual cannot switch to a real project.
6. Two casual phones get different session storage keys.
