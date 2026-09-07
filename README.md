# WhatsApp → Cursor Agent Bridge

Text Cursor Agent from WhatsApp. Runs locally on your MacBook.

## Setup

```bash
npm install
cp .env.example .env
cp projects.example.json projects.json
# Edit projects.json (dirs to scan, exclude, aliases)
# Edit .env and set ALLOWED_NUMBERS (or ADMIN_WHATSAPP_PHONE) to your number
npm test
npm run dev
```

Scan the QR code in the terminal with WhatsApp → Linked Devices.

Baileys session files are stored in `auth_info/` (same layout as 7Chalo's `whatsapp-service`).

## Talking to the bridge

Just text what you want done, or forward a screenshot / voice note. Useful phrases:

| You say | What happens |
|---|---|
| `help` / `hi` | Show help + project picker |
| `1` / `shop` / `switch to webapp` | Pick or switch project |
| `projects` | Show the project picker again |
| `what project am I on?` | Show the current project |
| `new chat` | Start a fresh Cursor thread for this project |
| `status` | Check whether a run is in progress |
| `stop` | Cancel the current Cursor run |
| `stop all` | Cancel the current run and clear the queue |
| Forward a message / `issue <text>` | Open a GitHub issue in the current project (needs `gh` auth) |
| _(anything else)_ | Queue or run a Cursor Agent prompt |

## Notes

- Only one Cursor task runs at a time; extra prompts are queued (up to 5).
- Conversation history is stored per project under `history/<project>/`.
- Run logs go to `logs/YYYY-MM-DD.jsonl`.
- Pairing credentials persist in `auth_info/`.
- The bridge refuses to start if `ALLOWED_NUMBERS` is empty (fail-closed).
- Edits to `projects.json` are picked up on the next picker/switch without restart.
- Voice notes are transcribed with OpenAI Whisper when `OPENAI_API_KEY` is set.
- Inbox media and old logs older than `RETENTION_DAYS` are cleaned up on startup.
- Do not commit `.env`, `projects.json`, `auth_info/`, `history/`, or `state.json`. Those stay on your machine.

## Docs

Longer write-ups live in `docs/`:

- [Project documentation](docs/PROJECT_DOCUMENTATION.md)
- [Improvement plan](docs/PLAN.md)
- [Discord bot plan](docs/DISCORD_BOT_PLAN.md)

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_NUMBERS` | _(required)_ | Comma-separated owner WhatsApp numbers (digits + country code) |
| `ADMIN_WHATSAPP_PHONE` | — | Alias for a single owner number (7Chalo compat) |
| `CASUAL_NUMBERS` | — | Comma-separated numbers limited to the built-in `general/` workspace |
| `CURSOR_BIN` | `cursor` | Cursor CLI binary |
| `DEFAULT_PROJECT` | — | Project key from `projects.json` to select on first start |
| `APP_NAME` | `CursorWA` | Linked-device browser identity |
| `CURSOR_TIMEOUT_MIN` | `15` | Kill a Cursor run after this many minutes |
| `OPENAI_API_KEY` | — | Enables voice-note transcription via Whisper |
| `RETENTION_DAYS` | `7` | Delete `history/inbox/` and `logs/` files older than this on startup |
