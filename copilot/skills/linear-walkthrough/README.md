# linear-walkthrough

This skill creates a private PR review walkthrough as a local Markdown artifact.

This folder now contains the full walkthrough package: the skill, the reusable prompt template, and the helper script used for mechanically grounded notes and hunks.

## Files

- `SKILL.md` - skill metadata and instructions
- `prompt.md` - reusable prompt template for manual Copilot use
- `scribe.cs` - helper for adding reviewer-facing notes, steps, and grounded hunks

## Preferred flow

1. Invoke the `linear-walkthrough` skill in Copilot.
2. Let the skill create or refresh the local `pr-review-*.md` artifact.
3. If you want to refine the review manually, use `scribe.cs` for grounded updates.

## Prerequisites

- `dotnet`
- `gh` when you want to initialize from a GitHub PR URL
- `git` when you want to initialize from a local branch comparison

## Key principles

- **Narrative first**: the goal is not a complete file-by-file retelling of the diff. The walkthrough should help a reviewer navigate the semantic core of the PR in the order that makes the change easiest to understand.
- **Grounded**: the walkthrough should point to real file paths and quote real snippets or diff hunks when that improves reviewer understanding. Prefer mechanical extraction via `scribe.cs` such as `--lines` or `--content` so the evidence stays tied to inspected source and avoids hallucinated excerpts.

## Useful helper commands

Print the tailored prompt for the current review file:

```powershell
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- prompt --file .\pr-review-*.md
```

Add or refine review content:

```powershell
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file .\pr-review-*.md --section "Reviewer Brief" --path src\File.cs --text "Short reviewer-facing observation"
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step --file .\pr-review-*.md --title "Core flow" --path src\File.cs --text "Explain the behavior change in reviewer terms"
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file .\pr-review-*.md --path src\File.cs --summary "Why it matters" --lines 18-30
```

## Notes

- If `--file` is omitted for `scribe.cs`, it uses the only `pr-review-*.md` file in the current folder.
- `scribe.cs -- undo` removes the last helper-added block.
- `scribe.cs -- open` opens the review file with the system default app.
- `--compare <base>...<head>` runs against the git repository for the current working directory. If you run it from the `dotfiles` repo, it compares branches in `dotfiles`, not some other repo.

## Future improvements

- The narrative quality still needs work. The walkthrough can sometimes get pulled into lower-signal detail instead of consistently guiding the reviewer through the semantic core of the change, so this is still being iterated on.
- The current output is static Markdown. A stronger experience would be more interactive: letting the reviewer ask follow-up questions of the model, and making file or diff references clickable so they open the relevant hunk or source range directly in the editor or VS Code.
