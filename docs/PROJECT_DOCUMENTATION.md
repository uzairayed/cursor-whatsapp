# Cursor WhatsApp Bridge — Project Documentation

## 1. Purpose

This project is a local, single-process bridge between WhatsApp and Cursor Agent. An allowlisted WhatsApp user can select a local project, send a software task by text, screenshot, or voice note, and receive Cursor's response in the same WhatsApp conversation.

The bridge runs on the Mac that owns the configured project folders. It does not expose an HTTP server, REST API, webhook, admin UI, or public network endpoint.

## 2. System architecture

```text
Allowlisted WhatsApp user
        │
        │ WhatsApp Web protocol
        ▼
Baileys WASocket
  ├─ pairing and persisted credentials
  ├─ reconnect and LID/phone resolution
  ├─ inbound message/media extraction
  └─ outbound replies and reactions
        │
        ▼
MessageRouter
  ├─ conversational command parser
  ├─ project selection
  ├─ one active run + five-item FIFO queue
  ├─ progress heartbeats
  └─ response formatting and splitting
        │
        ▼
CursorRunner
  └─ cursor agent -p --trust --force --output-format json
        │
        ▼
Selected local project

Optional voice path:
WhatsApp audio → local inbox → OpenAI Whisper → Cursor prompt
```

### Runtime characteristics

- Node.js 20 or newer, TypeScript, ESM.
- One long-running Node process.
- One active WhatsApp socket.
- One Cursor subprocess at a time across all projects and allowlisted numbers.
- Filesystem persistence only; no database or cache service.
- Outbound networking to WhatsApp and, when voice is enabled, OpenAI.

## 3. Startup and shutdown

The entry point is `src/index.ts`.

Startup:

1. Read `.env` without overriding variables already present in `process.env`.
2. Build the application configuration.
3. Refuse to start unless at least one owner number is allowlisted.
4. Delete expired files from `history/inbox/` and `logs/`.
5. Construct the router and connect to WhatsApp.
6. Print a QR code if the stored WhatsApp session cannot be reused.

An error from the main startup path logs the failure and exits with code 1. An unhandled rejection is logged without immediately terminating the process so reconnect activity can continue.

Run modes:

```bash
npm run dev
npm run build
npm start
npm run typecheck
npm test
```

## 4. Configuration API

### Environment variables

| Variable | Required | Default | Meaning |
|---|---:|---|---|
| `ALLOWED_NUMBERS` | Yes, unless alias is used | — | Comma-separated owner WhatsApp numbers. Non-digits are removed. |
| `ADMIN_WHATSAPP_PHONE` | Alternative | — | Single-number compatibility alias. |
| `CURSOR_BIN` | No | `cursor` | Cursor CLI executable. |
| `DEFAULT_PROJECT` | No | — | Initial key from `projects.json`. |
| `APP_NAME` | No | `CursorWA` | WhatsApp linked-device browser identity. |
| `CURSOR_TIMEOUT_MIN` | No | `15` | Maximum Cursor run duration; minimum accepted value is one minute. |
| `OPENAI_API_KEY` | No | — | Enables voice-note transcription with Whisper. |
| `RETENTION_DAYS` | No | `7` | Age threshold for startup cleanup; minimum is one day. |

The maximum outbound WhatsApp message size is fixed at 4,000 characters.

### Project registry

`projects.json` can scan parent directories (immediate children that contain `package.json` or `.git`) or use a legacy flat map:

```json
{
  "dirs": ["~/projects"],
  "exclude": ["cursor-whatsapp", "node_modules"],
  "aliases": {
    "webapp": "~/projects/webapp"
  }
}
```

Keys are derived from folder names (lowercased, non-alphanumerics → `-`). `aliases` win on key clash. Legacy shape `{ "key": "/path" }` still works. The registry reloads on picker/switch/resolve; picker order is alphabetical.

### Persistent state

| Location | Data | Lifecycle |
|---|---|---|
| `auth_info/` | Baileys credentials and encryption keys | Persists WhatsApp pairing; cleared after a 401 logout |
| `state.json` | Current project and picker mode | Shared globally by all allowlisted users |
| `history/<project>/conversation.json` | Cursor session ID and last 200 user/assistant messages | Separate per project |
| `history/inbox/` | Downloaded images and audio | Removed by retention cleanup on startup |
| `logs/YYYY-MM-DD.jsonl` | Run prompts, response snippets, timing, exit status, token counts, errors | Removed by retention cleanup on startup |

Conversation messages are an audit record. Cursor continuity is supplied by the stored Cursor `session_id` through `--resume`; local messages are not replayed into each prompt.

## 5. External and internal APIs

### Inbound API surface

There are no HTTP routes, webhooks, REST endpoints, GraphQL endpoints, MCP tools, or gRPC services. The inbound event API is the Baileys WhatsApp event stream:

| Event | Handler behavior |
|---|---|
| `creds.update` | Persist updated WhatsApp credentials |
| `connection.update` | Print QR, record connection, or choose reconnect action |
| `messages.upsert` | Process each eligible live direct message |

Only `messages.upsert` events with type `notify` are processed. History synchronization events are ignored.

### WhatsApp receive contract

An inbound message is processed only when all conditions are true:

1. It was not sent by the linked account itself.
2. It contains a message body.
3. It is a direct chat, not a group.
4. It is a live `notify` event.
5. The sender resolves to an allowlisted phone number.
6. It contains text, an image, or audio.

Unauthorized senders and unsupported messages are ignored without a WhatsApp reply.

Supported inbound content:

| Content | Support | Conversion to Cursor prompt |
|---|---|---|
| Plain or extended text | Full | Text is passed to the command parser or Cursor |
| Forwarded text | Full | Adds a forwarded-message note |
| Image with optional caption | Full | Downloads the file and includes its absolute path |
| Voice note/audio | Full when Whisper is configured | Downloads, transcribes, and prefixes `(voice note)` |
| Ephemeral/view-once wrapper | Partial | Wrapper is unwrapped, but image download may fail |
| Video | Caption only | Video bytes are not downloaded |
| Document | Caption only | Document bytes are not downloaded |
| Sticker/other media | Unsupported | Ignored |

Slash-prefixed messages remain text-only; attached media is ignored for slash commands.

### WhatsApp send contract

- Text: `sock.sendMessage(jid, { text })`.
- Reaction acknowledgement: `sock.sendMessage(jid, { react: { text, key } })`.
- Replies target the live chat JID, including `@lid` when applicable.
- A failed text send is retried once after 500 ms against the current active socket.
- Cursor output is converted from common Markdown conventions to WhatsApp formatting and split into chunks of at most 4,000 characters.

The bridge does not send images, files, audio, video, or interactive WhatsApp messages.

### Cursor CLI contract

Each normal prompt invokes:

```bash
cursor agent \
  -p \
  --trust \
  --output-format json \
  --workspace <selected-project-path> \
  --force \
  [--resume <stored-session-id>] \
  <prompt>
```

Behavior:

- Working directory and `--workspace` both target the selected project.
- `FORCE_COLOR=0` is set for parseable output.
- Standard input is ignored; stdout and stderr are captured.
- The last parseable JSON result line supplies `result`, `session_id`, and token usage.
- A new session ID is persisted for that project.
- Missing project paths fail before spawning.
- Missing Cursor CLI is mapped to a user-facing error.
- Timeout sends `SIGTERM`; a still-running process receives `SIGKILL` after three seconds.
- `stop` follows the same termination sequence.

Because runs use `--trust --force`, an authorized WhatsApp prompt can cause broad edits and command execution inside the selected project. The phone allowlist is the primary authorization boundary.

### OpenAI Whisper contract

Voice transcription performs:

```http
POST https://api.openai.com/v1/audio/transcriptions
Authorization: Bearer <OPENAI_API_KEY>
Content-Type: multipart/form-data

file=<downloaded audio>
model=whisper-1
```

There is no OpenAI call for ordinary text or image prompts.

## 6. User-facing features and commands

Commands are conversational and case-insensitive. A leading slash is accepted as a shortcut.

| Intent | Examples | Result |
|---|---|---|
| Help/onboarding | `help`, `hi`, `hello`, `hey`, `menu`, `start`, `what can you do` | Shows capabilities and enters project-picker mode |
| List/switch projects | `projects`, `list projects`, `switch project`, `change project` | Shows numbered picker and waits for a choice |
| Pick by number | `1`, `2` | Works only while picker mode is active |
| Pick by name | `shop` | Switches immediately when it exactly matches a project key |
| Explicit switch | `switch to webapp`, `use webapp`, `open webapp`, `project webapp` | Switches project or reopens picker if unknown |
| Current project | `current`, `where am i`, `which project`, `what project am I on?` | Shows project key and configured path |
| Fresh context | `new chat`, `start fresh`, `reset chat`, `clear chat`, `fresh chat` | Clears the stored Cursor session ID for the current project |
| Status | `status`, `are you working?`, `you there`, `still working` | Reports active project or idle state |
| Stop current task | `stop`, `cancel`, `nevermind` | Terminates the active Cursor process |
| Stop everything | `stop all`, `cancel all` | Terminates the active process and clears queued prompts |
| Unknown slash command | `/unknown` | Shows help and project picker |
| Any other text | A software request | Runs immediately or enters the queue |

If no project is selected, a normal task is not run. The bridge asks the user to choose a project first.

## 7. Prompt execution lifecycle

1. Resolve and authorize the sender.
2. Extract text or download/transcribe media.
3. Parse commands.
4. Resolve the current project.
5. If a run is active, enqueue the prompt.
6. Otherwise, react with the eyes acknowledgement; if reaction fails, send a text acknowledgement.
7. Spawn Cursor.
8. Send progress messages after 45 seconds, after two minutes, and every five minutes thereafter.
9. Parse Cursor's result and session ID.
10. Store the conversation record and run log.
11. Format and split the response.
12. Send all response chunks.
13. Dequeue and run the next prompt.

### Queue semantics

- Exactly one Cursor run is active globally.
- FIFO queue capacity is five waiting prompts.
- The acknowledgement reports how many tasks are ahead.
- A sixth waiting prompt is rejected with guidance to wait or use `stop all`.
- Queue contents are memory-only and are lost on process restart.
- `stop` leaves queued prompts intact.
- `stop all` clears queued prompts.

## 8. User journeys

### Journey A: first-time setup and first task

1. Operator installs dependencies and creates `.env`.
2. Operator configures at least one allowlisted phone and one project.
3. Operator starts the bridge.
4. Operator scans the terminal QR in WhatsApp Linked Devices.
5. User sends `help`.
6. Bridge returns a numbered project picker.
7. User replies with a number or project name.
8. User sends a software request.
9. Bridge acknowledges, Cursor runs locally, and the answer returns in WhatsApp.

Success state: WhatsApp remains linked, the selected project is in `state.json`, and the Cursor session ID is stored under that project's history.

### Journey B: return to an existing project conversation

1. User sends a task with a current project already selected.
2. Bridge reads that project's stored Cursor session ID.
3. Cursor is invoked with `--resume`.
4. New session data and the response are persisted.

Success state: Cursor continues the project-specific thread.

### Journey C: switch projects

1. User asks for `projects` or says `switch to <name>`.
2. Bridge reloads `projects.json`.
3. User chooses a project.
4. Bridge stores the selection globally.
5. The next task uses that project's path and session ID.

### Journey D: screenshot-assisted task

1. User sends or forwards an image, optionally with a caption.
2. Bridge downloads it to `history/inbox/`.
3. The generated prompt includes the absolute image path and forwarding context.
4. Cursor reads the local image and responds.

Failure recovery: if download fails, the bridge asks the user to resend it as a non-view-once image.

### Journey E: voice task

1. User sends a voice note.
2. Bridge downloads the audio.
3. Whisper transcribes it.
4. The transcript becomes a normal Cursor prompt.

Failure recovery:

- Without `OPENAI_API_KEY`, the bridge explains that transcription is unavailable.
- On download or transcription failure, it asks for another attempt or text.

### Journey F: long-running task

1. Cursor starts and the bridge acknowledges immediately.
2. Progress heartbeats reassure the user at configured intervals.
3. User may ask `status`, send additional queued work, or say `stop`.
4. On completion, the bridge sends the answer and optional token usage.

### Journey G: queue several tasks

1. First task starts.
2. Up to five additional prompts are queued FIFO.
3. Each receives its queue position.
4. Each prompt starts automatically after the previous run finishes.
5. `stop all` is the escape path for cancelling active and pending work.

### Journey H: reset context

1. User says `new chat`.
2. Bridge clears the current project's stored Cursor session ID.
3. The next prompt omits `--resume` and creates a fresh Cursor thread.
4. Other projects retain their own session IDs.

### Journey I: reconnect and re-pair

1. A transient disconnect triggers exponential backoff from roughly 1 to 60 seconds with jitter.
2. Eight closes within two minutes trigger a 15-minute cooldown.
3. A session conflict (440) waits three minutes and recommends unlinking competing devices.
4. A logout (401) clears credentials and presents a fresh QR.
5. A forbidden response (403) stops reconnecting.

## 9. Failure handling

| Failure | User/system behavior |
|---|---|
| Empty allowlist | Startup fails closed |
| Unauthorized sender | Logged locally and ignored |
| Group message | Ignored |
| Historical message | Ignored |
| Unsupported media | Ignored |
| Image download failure | User is asked to resend a non-view-once image |
| Voice without API key | User is told transcription is disabled |
| Voice transcription failure | User is asked to retry or send text |
| No selected project | Project picker is shown |
| Unknown project | Picker is shown with an error |
| Missing project directory | Cursor is not spawned; path error is returned |
| Missing Cursor binary | `Cursor CLI not found.` |
| Cursor timeout | Process is terminated and a timeout message is returned |
| Cursor nonzero exit | Available stdout/stderr is returned |
| Cursor succeeds with no output | Placeholder completion message is returned |
| Reaction failure | Text acknowledgement is sent |
| Reply send failure | One retry using the active socket |
| Handler exception | Logged; processing continues with later messages |

## 10. Security and trust boundaries

### Controls

- Mandatory, fail-closed owner allowlist.
- Direct-message-only processing.
- Sender resolution supports phone-number JIDs and privacy LIDs.
- Runtime credentials, history, logs, state, and `.env` are gitignored.
- No inbound TCP listener.

### Risks and limitations

- `--trust --force` grants Cursor broad capability in selected local projects.
- Allowlist matching permits suffix matches to tolerate country-code variants; shorter configured values reduce identity precision.
- All allowlisted numbers share the same selected project, queue, and project sessions.
- Prompts, response snippets, token usage, and local paths are written to disk.
- Downloaded media remains until startup retention cleanup runs.
- There is no per-command confirmation, sandbox, role system, rate limit, or per-user audit identity.

Use full international phone numbers, keep the Mac and WhatsApp account secured, and restrict `projects.json` to intended workspaces.

## 11. Reliability and operational behavior

- The active WhatsApp socket is stored in a module-level holder so retries use the newest connection.
- Reconnect attempts are single-flight.
- Backoff resets only after the connection remains open for at least 60 seconds.
- Progress heartbeats do not abort a run if their WhatsApp send fails.
- Project configuration hot-reloads; environment variables require restart.
- Retention cleanup runs only during startup, not continuously.
- Logs are JSON Lines and conversation records are JSON.

## 12. Module map

| Module | Responsibility |
|---|---|
| `src/index.ts` | Bootstrap, allowlist guard, housekeeping |
| `src/config/index.ts` | `.env` parsing and `AppConfig` |
| `src/config/allowlist.ts` | Number normalization and fail-closed guard |
| `src/baileys/client.ts` | WhatsApp lifecycle and message pipeline |
| `src/baileys/reconnect.ts` | Backoff, storm cooldown, conflict, reauth |
| `src/baileys/socket-holder.ts` | Current socket and send retry |
| `src/baileys/message-content.ts` | Wrapper unwrapping and prompt construction |
| `src/baileys/save-image.ts` | Image download |
| `src/baileys/save-audio.ts` | Audio download |
| `src/baileys/transcribe.ts` | Whisper request |
| `src/commands/index.ts` | Conversational intents |
| `src/commands/router.ts` | Command dispatch, queue, runs, replies |
| `src/commands/prompt-queue.ts` | Bounded FIFO queue |
| `src/commands/progress.ts` | Long-run heartbeat schedule |
| `src/cursor/runner.ts` | Cursor process contract and result parser |
| `src/orchestration/mode.ts` | Orchestrate vs solo mode parsing and replies |
| `src/orchestration/plan-first.ts` | Large-prompt heuristic, plan preamble, go/cancel |
| `src/orchestration/prompt.ts` | Main-agent preamble that launches specialist Tasks |
| `src/projects/index.ts` | Project registry, global selection, agent mode |
| `src/conversation/index.ts` | Per-project session and audit history |
| `src/logger/index.ts` | Daily JSONL run records |
| `src/utils/whatsapp-format.ts` | Cursor Markdown to WhatsApp formatting |
| `src/utils/split.ts` | Long-message chunking |
| `src/utils/housekeeping.ts` | Retention cleanup |

## 13. Implemented scope and explicit gaps

Implemented:

- QR pairing and persistent WhatsApp credentials.
- Owner allowlist and direct-message filtering.
- Text commands and natural-language project switching.
- Hot-reloaded project registry.
- Per-project Cursor session resume and fresh-chat reset.
- Text, screenshot, forwarded-message, and voice-note inputs.
- One active Cursor run, bounded queue, status, stop, and stop-all.
- Long-task progress, result formatting, chunking, usage footer, run logs.
- Reconnect backoff, conflict handling, storm cooldown, and re-pairing.
- Startup retention cleanup.

Not implemented:

- Group chat control.
- Per-user project selection, queues, or Cursor sessions.
- HTTP/webhook/API control plane.
- Web or desktop administration UI.
- Outbound image, document, video, or audio delivery.
- Download or analysis of video/document payloads beyond their captions.
- Persistent queue across restarts.
- Continuous background retention cleanup.
- End-to-end tests against live WhatsApp and live Cursor; tests cover isolated behavior with mocks.

## 14. Test coverage

The Vitest suite covers the major isolated behaviors:

- allowlist parsing and startup guard;
- sender, JID, LID cache, and reply-JID resolution;
- live-upsert filtering;
- reconnect decisions and backoff;
- socket replacement and text retry;
- content extraction and media prompt construction;
- Whisper request/error handling;
- command intents, project picker, fresh chat, status, stop;
- queue capacity and draining;
- acknowledgement and progress heartbeat behavior;
- Cursor JSON parsing, timeout, stop, and kill fallback;
- output formatting, splitting, usage footer, and housekeeping;
- project registry reload and conversation persistence.

The current suite does not prove interoperability with the live WhatsApp service, a real Cursor CLI process, or the live OpenAI endpoint.

## 15. Source-of-truth index

- Setup and operator-facing behavior: `README.md`
- Architecture decisions and scope notes: `docs/PLAN.md`
- Runtime configuration: `src/config/index.ts`
- WhatsApp event and media pipeline: `src/baileys/client.ts`
- Connection recovery: `src/baileys/reconnect.ts`
- User commands: `src/commands/index.ts`
- Queue and run orchestration: `src/commands/router.ts`
- Cursor invocation contract: `src/cursor/runner.ts`
- Project state: `src/projects/index.ts`
- Cursor session persistence: `src/conversation/index.ts`
- Tests: `src/**/*.test.ts`
