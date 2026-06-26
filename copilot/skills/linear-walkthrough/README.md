# linear-walkthrough

Creates a private PR review walkthrough as a local, self-contained HTML artifact (inline CSS, no external dependencies).

## Files

- `SKILL.md` - skill metadata and instructions
- `scribe.cs` - helper that initializes the HTML scaffold and adds reviewer-facing notes, steps, and grounded hunks

## Flow

1. Invoke the `linear-walkthrough` skill in Copilot.
2. The skill creates or refreshes a local `pr-review-*.html` artifact (via `scribe.cs -- init`) and fills it through `scribe.cs`.

## Prerequisites

- `dotnet`
- `gh` to initialize from a GitHub PR URL
- `git` to initialize from a local branch comparison

## Key principles

- **Narrative first**: help the reviewer navigate the semantic core of the PR in the order that makes the change easiest to understand, rather than retelling the diff file-by-file.
- **Grounded**: point to real file paths and quote real snippets or diff hunks. Prefer mechanical extraction via `scribe.cs` (`--lines` or `--content`) so evidence stays tied to inspected source.

## Helper commands

```powershell
# Initialize the scaffold
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- init --file .\pr-review-123.html --title "PR #123 — concise summary" --subtitle "owner/repo • N files changed"

# Add reviewer-facing content
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file .\pr-review-123.html --section "Reviewer Brief" --path src\File.cs --text "Short reviewer-facing observation"
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step --file .\pr-review-123.html --title "Core flow" --path src\File.cs --text "Explain the behavior change in reviewer terms"
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file .\pr-review-123.html --path src\File.cs --summary "Why it matters" --lines 18-30
```

Run `scribe.cs` with no arguments for the full command/flag reference.

## Notes

- Output is a single self-contained HTML file with inline CSS (light/dark aware) that opens directly in a browser — no build step or external assets.
- If `--file` is omitted, the helper uses the only `pr-review-*.html` file in the current folder.
- `scribe.cs -- undo` removes the last helper-added block; `scribe.cs -- open` opens the review file.
- All text is HTML-escaped automatically; always update the file through the helper so it stays well-formed.
