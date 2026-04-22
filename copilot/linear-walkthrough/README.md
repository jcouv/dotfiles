# Linear walkthrough helper

Small local helpers for building a private PR review walkthrough in Markdown.

## Files

- `walkthrough.cs` creates or refreshes the initial `pr-review-*.md` scaffold.
- `scribe.cs` adds reviewer-facing notes, walkthrough steps, and grounded hunks to an existing review file.
- `prompt.md` is a reusable prompt template for manual Copilot use. It is not read automatically at runtime.

## Prerequisites

- `dotnet`
- `copilot` for the auto-fill path in `walkthrough.cs`
- `gh` when you want to initialize from a GitHub PR URL
- `git` when you want to initialize from a local branch comparison

## Key principles

- **Narrative first**: the goal is not a complete file-by-file retelling of the diff. The walkthrough should help a reviewer navigate the semantic core of the PR in the order that makes the change easiest to understand.
- **Grounded**: the walkthrough should point to real file paths and quote real snippets or diff hunks when that improves reviewer understanding. Prefer mechanical extraction via `scribe.cs` such as `--lines` or `--content` so the evidence stays tied to inspected source and avoids hallucinated excerpts.

## Typical flow

1. Create the scaffold:

   ```powershell
   dotnet run .\walkthrough.cs -- <github-pr-url>
   ```

   Or from a local compare:

   ```powershell
   dotnet run .\walkthrough.cs -- --compare <base>...<head>
   ```

2. If you want to drive the writing manually, stop after scaffold creation:

   ```powershell
   dotnet run .\walkthrough.cs -- <github-pr-url> --scaffold-only
   ```

3. Print the tailored prompt for the current review file:

   ```powershell
   dotnet run .\scribe.cs -- prompt
   ```

4. Add or refine review content:

   ```powershell
   dotnet run .\scribe.cs -- note --file .\pr-review-*.md --section "Reviewer Brief" --path src\File.cs --text "Short reviewer-facing observation"
   dotnet run .\scribe.cs -- step --file .\pr-review-*.md --title "Core flow" --path src\File.cs --text "Explain the behavior change in reviewer terms"
   dotnet run .\scribe.cs -- hunk --file .\pr-review-*.md --path src\File.cs --summary "Why it matters" --lines 18-30
   ```

## Notes

- Re-running `walkthrough.cs` with the same input overwrites the canonical `pr-review-*.md` file.
- If `--file` is omitted for `scribe.cs`, it uses the only `pr-review-*.md` file in the current folder.
- `scribe.cs -- undo` removes the last helper-added block.
- `scribe.cs -- open` opens the review file with the system default app.
- `--compare <base>...<head>` runs against the git repository for the current working directory. If you run it from this `dotfiles` folder, it compares branches in the `dotfiles` repo, not some other repo.

## Future improvements

- The narrative quality still needs work. The walkthrough can sometimes get pulled into lower-signal detail instead of consistently guiding the reviewer through the semantic core of the change, so this is still being iterated on.
- The current output is static Markdown. A stronger experience would be more interactive: letting the reviewer ask follow-up questions of the model, and making file or diff references clickable so they open the relevant hunk or source range directly in the editor or VS Code.
