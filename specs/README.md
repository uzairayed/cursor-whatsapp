# Spec-driven TDD

Work in this repo follows **spec → red → green → refactor**.

## Hierarchy

```text
specs/
  README.md                 ← you are here
  features/                 ← product/feature acceptance specs
  agents/                   ← contracts for orchestrator + specialist roles
.cursor/
  agents/                   ← Cursor-runtime agent definitions (loaded by CLI)
  rules/                    ← always-on agent rules for this workspace
src/
  orchestration/            ← bridge code that enables multi-agent runs
```

## Loop

1. **Spec**: write or update a file under `specs/features/` with acceptance criteria, commands, and non-goals.
2. **Red**: add a failing Vitest that asserts one acceptance criterion.
3. **Green**: implement the minimum in `src/` to pass.
4. **Refactor**: clean up with tests still green.
5. Only then mark the criterion done in the feature spec.

## Multi-agent model

WhatsApp still starts **one** Cursor CLI process (the main / orchestrator agent). That agent uses Cursor's Task tool to launch specialist subagents defined in `.cursor/agents/`.

The bridge does **not** spawn N independent `cursor agent` processes. Parallelism is inside the main agent's session.

## Target projects

When a WhatsApp task runs against another workspace (e.g. `webapp`), the bridge injects an orchestration preamble. Projects may also adopt:

- `specs/features/` for their own feature specs
- `.cursor/agents/` for project-local specialists

If a target project has no agents, the main agent still orchestrates using the preamble + built-in Task subagents.
