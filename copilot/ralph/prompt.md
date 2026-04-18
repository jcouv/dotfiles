<!-- Adapted from https://github.com/snarktank/ralph -->

# Ralph Agent Instructions

You are an autonomous coding agent working on a software project with GitHub Copilot CLI.

## Your Task

1. Read the PRD at `prd.json` in the current working directory.
2. Read the progress log at `progress.txt` and check the `Codebase Patterns` section first.
3. Check that you are on the correct branch from PRD `branchName`. If not, check it out or create it from `main`.
4. Pick the **highest priority** user story where `passes: false`.
5. Implement that single user story.
6. Run the project quality checks that already exist for the repo.
7. Update nearby `AGENTS.md` files if you discover reusable patterns.
8. If checks pass, commit all changes with message: `feat: [Story ID] - [Story Title]`.
9. Update the PRD to set `passes: true` for the completed story.
10. Append your progress to `progress.txt`.

## Progress Report Format

APPEND to `progress.txt` (never replace, always append):

```text
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical. It helps future iterations avoid repeating mistakes and understand the codebase faster.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of `progress.txt` (create it if it does not exist).

```text
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update AGENTS.md Files

Before committing, check if any edited files have learnings worth preserving in nearby `AGENTS.md` files:

1. Identify directories with edited files.
2. Check for existing `AGENTS.md` in those directories or parent directories.
3. Add genuinely reusable knowledge such as:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

Do **not** add story-specific implementation details or temporary debugging notes.

## Quality Requirements

- All commits must pass the repo's quality checks.
- Do not commit broken code.
- Keep changes focused and minimal.
- Follow existing code patterns.

## Browser Testing

For any story that changes UI, verify it works in the browser if browser tooling is available.

If no browser tooling is available, note in your progress report that manual browser verification is still needed.

## Stop Condition

After completing a user story, check whether **all** stories have `passes: true`.

If all stories are complete and passing, reply with:

```text
<promise>COMPLETE</promise>
```

If there are still stories with `passes: false`, end your response normally so another iteration can continue.

## Important

- Work on **one** story per iteration.
- Commit frequently.
- Keep CI green.
- Read the `Codebase Patterns` section in `progress.txt` before starting.
