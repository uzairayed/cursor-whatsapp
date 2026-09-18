# WhatsApp to Cursor Agent Bridge

Text Cursor Agent from WhatsApp. Runs on your Mac.

## Setup

```bash
npm install
cp .env.example .env
cp projects.example.json projects.json
# Edit projects.json (folders to scan, skip list, aliases)
# Edit .env and set ALLOWED_NUMBERS (or ADMIN_WHATSAPP_PHONE) to your number
npm test
npm run dev
```

Scan the QR code in the terminal with WhatsApp → Linked Devices.

WhatsApp login files are stored in `auth_info/`.

## Talking to the bridge

Send what you want done, or forward a screenshot or voice note. Useful phrases:

| You say | What happens |
|---|---|
| `help` / `hi` | Show help and the project list |
| `1` / `shop` / `switch to webapp` | Pick or switch project |
| `projects` | Show the project list again |
| `what project am I on?` | Show the current project |
| `new chat` | Start a fresh Cursor chat for this project |
| `status` | Check if a run is in progress |
| `stop` | Cancel the current Cursor run |
| `stop all` | Cancel the current run and clear the queue |
| Forward a message / `issue <text>` | Open a GitHub issue in the current project (needs `gh` login) |
| _(anything else)_ | Queue or run a Cursor Agent prompt |

## Notes

- Only one Cursor task runs at a time. Extra prompts wait in a queue (up to 5).
- Chat history is stored per project under `history/<project>/`.
- Run logs go to `logs/YYYY-MM-DD.jsonl`.
- Login files stay in `auth_info/`.
- The bridge will not start if `ALLOWED_NUMBERS` is empty.
- Edits to `projects.json` apply the next time you pick or switch a project. No restart needed.
- Voice notes are turned into text with OpenAI Whisper when `OPENAI_API_KEY` is set.
- Inbox media and old logs older than `RETENTION_DAYS` are deleted on startup.
- Do not commit `.env`, `projects.json`, `auth_info/`, `history/`, or `state.json`. Those stay on your machine.

## Docs

Longer notes live in `docs/`:

- [Project documentation](docs/PROJECT_DOCUMENTATION.md)
- [Improvement plan](docs/PLAN.md)
- [Discord bot plan](docs/DISCORD_BOT_PLAN.md)

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_NUMBERS` | _(required)_ | Owner WhatsApp numbers, comma-separated (digits and country code) |
| `ADMIN_WHATSAPP_PHONE` | none | Alternate name for a single owner number |
| `CASUAL_NUMBERS` | none | Numbers that can only use the built-in `general/` chat |
| `CURSOR_BIN` | `cursor` | Cursor CLI binary |
| `DEFAULT_PROJECT` | none | Project key from `projects.json` to select on first start |
| `APP_NAME` | `CursorWA` | Name shown in WhatsApp Linked Devices |
| `CURSOR_TIMEOUT_MIN` | `15` | Stop a Cursor run after this many minutes |
| `OPENAI_API_KEY` | none | Turns voice notes into text with Whisper |
| `RETENTION_DAYS` | `7` | Delete `history/inbox/` and `logs/` files older than this on startup |
