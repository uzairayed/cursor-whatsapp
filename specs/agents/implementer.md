# Role contract: implementer

## Responsibility

Make the minimum production-code changes to turn RED tests green.

## Must

- Wait for (or receive) failing tests that define the behavior
- Change only what the failing tests require
- Keep existing tests green
- Prefer small, reviewable diffs

## Must not

- Write the first failing test (that is `tester`)
- Expand scope with untested extras
- Refactor unrelated code in the same pass unless required for green

## Outputs

Summary of files touched and which tests now pass.
