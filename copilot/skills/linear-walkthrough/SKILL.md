---
name: linear-walkthrough
description: "Create or refresh a private PR review walkthrough as a self-contained HTML file. Use when asked to write a reviewer brief, narrative PR walkthrough, grounded review notes, or a linear walkthrough of a PR. Triggers on: walkthrough this PR, write a PR walkthrough, reviewer brief, review narrative, linear walkthrough."
user-invocable: true
---

# Linear PR Walkthrough

Produce a private, self-contained `pr-review-*.html` file (inline CSS, no external dependencies) that helps a human reviewer understand a change. It is a local artifact, not a GitHub comment.

Two principles drive everything:

- **Narrative first.** Explain the semantic core of the change in the order that builds the right mental model. Use files as evidence, not as the outline. Do not retell the diff file-by-file unless that is genuinely clearest.
- **Grounded.** Cite real file paths and quote real inspected excerpts or diff hunks. Never invent code, excerpts, or rationale. If you infer intent rather than seeing it, say so.

## Workflow

1. **Find the source** (try in order, ask only if none apply): a GitHub PR URL the user gave; the current branch's PR (`gh pr view`); a local compare (`base...head`). Inspect with `gh pr view`/`gh pr diff` or `git diff <base>...<head>`.

2. **Create the file** with `scribe.cs -- init`, which writes the HTML scaffold with three sections: `Reviewer Brief`, `Walkthrough`, `Supporting Notes`. Name it `pr-review-<owner>-<repo>-pr-<number>.html` (GitHub) or `pr-review-compare-<base>-vs-<head>.html` (local), kebab-cased. If the file already exists, update it in place; use `--force` only to overwrite.

   ```
   dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- init --file pr-review-dotnet-roslyn-pr-123.html --title "PR #123 — concise summary" --subtitle "dotnet/roslyn • 6 files changed"
   ```

3. **Fill the sections** via `note`, `step`, and `hunk` (default section is `Walkthrough`; pass `--section` for the others). Always go through the helper so the HTML stays well-formed and `undo` works.
   - `Reviewer Brief` (do first): what changed, why it matters, which areas need the most attention, and a confidence note when intent is inferred.
   - `Walkthrough`: the narrative, organized by logical threads starting from the most behavior-changing path. Use `step` titles as subheadings. Cite the real paths each segment depends on.
   - `Supporting Notes`: low-signal churn (tests, localization, generated files, config). Keep brief.

4. **Ground claims** with `hunk` when an excerpt helps: `--lines <start-end>` for a local file, `--content "@@ ... @@"` for a diff-only hunk, plus a `--summary` of why it matters. Prefer focused excerpts over large dumps; all text is HTML-escaped automatically.

Run `scribe.cs` with no args (or see README) for the full command/flag reference.

## Guardrails

- Keep everything private and local. Do not post to GitHub or create a review on the user's behalf.
- Do not claim the walkthrough is done until the HTML file actually contains the walkthrough.
- Do not invent code, diff hunks, or intent.
