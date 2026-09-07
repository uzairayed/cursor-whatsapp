# Feature: Forward a WhatsApp message → GitHub issue

Status: **done**

## Problem

Capturing a bug, customer note, or screenshot as a GitHub issue currently means switching to the browser or asking Cursor to file it. Forwarding the message to this chat should be enough.

## Goal

When an **owner** forwards a WhatsApp message (or types `issue …`) while a code project is selected, the bridge files a GitHub issue in that project's repo via `gh` and replies with the issue URL. Cursor is not started.

## Behavior

### Triggers (owner only)

| Input | Result |
|---|---|
| Forwarded message (text, image caption, or transcribed voice note) | File an issue from that content |
| `issue <text>` or `/issue <text>` | File an issue from the typed text |
| `issue` / `/issue` with no body | Ask what to file; do not call `gh` |

Forwarded messages skip Cursor **and** skip other commands (`status`, `ask …`, etc.). A forwarded "status" is an issue, not a status check.

Plain (not forwarded) messages other than `issue …` are unchanged.

### Project / access

- Current code project is required. If none is selected, ask which project (same picker as today). Do not call `gh`.
- `general` is not a GitHub project: refuse with a short message, do not call `gh`.
- Casual senders cannot file issues: refuse with a short message.

### Issue content

- **Title:** first non-empty line of the source text, trimmed, max 80 characters (ellipsis if truncated). If there is no text but there is an image, title is `WhatsApp screenshot`. If there is no text and no image, title is `WhatsApp note`.
- **Body:** the full source text, plus a one-line footer `Filed from WhatsApp.`
- **Screenshot:** download the WhatsApp image and upload it to GitHub user-attachments, then embed `![WhatsApp screenshot](https://github.com/user-attachments/assets/…)` in the body so the picture is visible on the issue. Do **not** put local file paths in the body. An image-only forward with no uploaded image must not create an empty issue (that is how #94 happened).
- If upload fails, reply with a short error and do not create the issue.

### GitHub

- Resolve the current project's numeric REST `repository_id` with `gh repo view` (nameWithOwner) then `gh api repos/OWNER/REPO --jq .id` from the project workspace.
- Upload with `POST https://uploads.github.com/user-attachments/assets` using `gh auth token` (same as `gh issue create --attach`).
- Run `gh issue create --title … --body …` with `cwd` set to the current project's workspace so `gh` uses that repo's remote.
- On success, reply with a short confirmation that includes the issue URL from `gh` stdout.
- On failure (not a git repo, `gh` missing, auth error, upload error, etc.), reply with a short error. Do not start Cursor.

Issue filing is immediate (not queued behind Cursor runs).

### Help / docs

Owner help mentions forwarding a message (or `issue <text>`) to file a GitHub issue. README documents the same.

## Non-goals

- Labels, assignees, or repo overrides
- Casual / general issue filing
- Discord or other transports
- OCR / asking Cursor to describe the screenshot
