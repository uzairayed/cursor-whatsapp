# Feature: Self-hosted Cursor PR review

## Goal

Run the existing Cursor reviewer contract on a **self-hosted Mac runner** (local `agent login`, no `CURSOR_API_KEY`) and post the result as a GitHub PR comment instead of WhatsApp.

## Triggers

- Run locally with `npm run ci:review` (needs `PR_NUMBER` and `gh` auth).
- Do **not** add a `pull_request` + `runs-on: self-hosted` workflow on a public repo. Anyone who can open a PR would run code on the runner machine.

## Acceptance criteria

1. [x] A prompt builder produces a read-only review prompt that references `specs/agents/reviewer.md`, forbids file edits, and embeds the PR metadata + diff.
2. [x] A CI script invokes the local Cursor CLI in ask/read-only mode (`--mode ask`, no `--force`), captures stdout, and exits non-zero if Cursor fails.
3. [x] The GitHub Actions self-hosted workflow is **not** shipped (public-repo runner risk). Operators who keep the repo private may add one locally.
4. [x] Workflow / script does not require or reference `CURSOR_API_KEY`.

## Non-goals

- GitHub-hosted runners
- WhatsApp / Discord delivery
- Auto-approving PRs or applying patches in CI
- Installing Cursor CLI in the workflow (runner machine already has it logged in)

## Setup (operator)

1. On the Mac: `agent login` once (browser flow).
2. Install `gh` and authenticate (`gh auth login`).
3. Run `PR_NUMBER=<n> npm run ci:review` from a private checkout.
4. Only register a self-hosted Actions runner if the repository stays private.
