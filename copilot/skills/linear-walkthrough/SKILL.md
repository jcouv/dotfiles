---
name: linear-walkthrough
description: "Create or refresh a private PR review walkthrough as a self-contained HTML file. Use when asked to write a reviewer brief, narrative PR walkthrough, grounded review notes, or a linear walkthrough of a PR. Triggers on: walkthrough this PR, write a PR walkthrough, reviewer brief, review narrative, linear walkthrough."
user-invocable: true
---

# Linear PR Walkthrough

Create a reviewer-facing walkthrough of a PR or local compare that is **narrative first** and **grounded in real evidence**.

The output is a private local, self-contained HTML file (inline CSS, no external dependencies), not a GitHub review comment.

---

## The Job

Produce or refresh a `pr-review-*.html` file that helps a human reviewer understand the semantic core of a change.

The walkthrough should:

1. Start with a concise `Reviewer Brief` section
2. Turn the `Walkthrough` section into a coherent narrative
3. Keep low-signal churn brief under `Supporting Notes`
4. Cite real file paths throughout
5. Quote real inspected excerpts or diff hunks when they improve understanding

Always create the file with `scribe.cs -- init` and update it through the `scribe.cs` helper so the HTML stays well-formed.

---

## Core Principles

### 1. Narrative first

Do **not** retell the PR file-by-file unless that is genuinely the clearest way to understand it.

Instead:

- Identify the semantic core of the change
- Explain the logic in the order that best helps a reviewer build the right mental model
- Use files as supporting evidence, not as the outline itself
- Keep the reviewer oriented: what changed, why it matters, and where to look next

If the draft starts getting lost in low-signal details, pull back and rewrite around the main behavioral thread.

### 2. Grounded

Every meaningful claim should come from inspected evidence.

- Cite the real file paths involved
- Prefer mechanically extracted snippets or hunks over paraphrased remembered code
- Use existing helpers such as `scribe.cs -- hunk --lines` or `scribe.cs -- hunk --content` when practical
- If intent is inferred rather than explicit, say so plainly

Never invent code, excerpts, or rationale.

---

## Source Discovery

Try to determine the review source automatically before asking the user.

Preferred order:

1. If the user gave a GitHub PR URL, use that
2. Otherwise, if the current branch has an associated PR, derive it with `gh pr view`
3. Otherwise, if the user specified a local compare (`base...head`), use that
4. Otherwise, ask for the source

For GitHub PRs, inspect with commands such as:

- `gh pr view <url>`
- `gh pr diff <url>`

For local compares, inspect with:

- `git diff <base>...<head>`
- `git diff --name-only <base>...<head>`

---

## Output File

Create the file with `scribe.cs -- init`, which writes a self-contained HTML scaffold with the three required sections.

If the user gives an output path, use it. Otherwise create a canonical HTML file in the current working directory:

- GitHub PR: `pr-review-<owner>-<repo>-pr-<number>.html`
- Local compare: `pr-review-compare-<base>-vs-<head>.html`

Sanitize path segments to kebab-case. Pass `--title` (and optionally `--subtitle` for the source line). For example:

```
dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- init --file pr-review-dotnet-roslyn-pr-123.html --title "PR #123 — concise summary" --subtitle "dotnet/roslyn • 6 files changed"
```

If the file already exists, preserve the existing structure and update it in place (via `scribe.cs -- note|step|hunk`) instead of creating a second competing draft. Use `--force` with `init` only when you intend to overwrite.

---

## Required Structure

`init` generates an HTML document containing these sections, each rendered as `<section data-section="...">` with an `<h2>` heading:

- A page title (`<h1>`) with an optional subtitle
- `Reviewer Brief`
- `Walkthrough`
- `Supporting Notes`

Add content to a section by passing `--section "<name>"` to `note`, `step`, or `hunk` (the default is `Walkthrough`). Use `step` titles to create logical subheadings inside the walkthrough. Unknown section names are created on demand.

---

## Writing the Reviewer Brief

Refine the `Reviewer Brief` section first (`--section "Reviewer Brief"`).

Keep it short and evidence-based. Include:

- what changed
- why it matters
- which files or areas deserve the most attention
- a confidence note when intent is inferred rather than explicit

This should orient the reviewer before the detailed walkthrough begins.

---

## Writing the Walkthrough

Turn the `Walkthrough` section into a reviewer-facing narrative (this is the default section for `note`, `step`, and `hunk`).

Guidelines:

- Organize by logical threads, not by diff order unless diff order is actually the clearest
- Start from the most behavior-changing code path
- Explain how surrounding files support, expose, or constrain that behavior
- Use several substantial sections when warranted
- Keep prose concise, specific, and evidence-based
- Prefer reviewer understanding over speculative bug hunting

Each substantive segment should cite the real file paths it depends on.

---

## Supporting Notes

Use the `Supporting Notes` section (`--section "Supporting Notes"`) for lower-signal churn:

- tests
- localization
- generated files
- config or workflow bookkeeping
- follow-up cleanup that is not central to the main story

Keep this section brief unless one of those items is actually central.

---

## Grounding Workflow

When excerpts would help:

1. Prefer mechanically extracted evidence
2. Use a focused excerpt rather than a large dump
3. Add a short summary explaining why the hunk matters

When practical, use:

- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note ...`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step ...`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --lines ...`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --content ...`

Use `--lines` for local files and `--content` for diff-only hunks. All excerpt text is HTML-escaped automatically.

Always go through the helper rather than hand-editing the HTML, so the document stays well-formed and `undo` keeps working.

---

## Guardrails

- Keep everything private and local unless the user explicitly asks for something else
- Do not post comments to GitHub
- Do not create a GitHub review on the user's behalf
- Do not claim the review is complete until the HTML file itself contains the walkthrough
- Do not invent code, diff hunks, or intent

---

## Interactivity

If the user wants to keep exploring after the file is written, stay in reviewer-assistant mode:

- answer follow-up questions about the PR
- inspect related files or usage sites
- add more grounded excerpts
- refine the narrative if it drifted into detail

Treat the HTML file as the artifact, but support an interactive review conversation around it.

---

## Completion Checklist

Before stopping, make sure:

- [ ] The output HTML file exists (created via `scribe.cs -- init`)
- [ ] The `Reviewer Brief` section is concise and evidence-based
- [ ] The `Walkthrough` section is narrative-first rather than a file-by-file dump
- [ ] Major claims are grounded in real inspected paths or excerpts
- [ ] The `Supporting Notes` section holds lower-signal churn
- [ ] Any leftover placeholder text has been removed (the helper drops placeholders automatically on first insert)
