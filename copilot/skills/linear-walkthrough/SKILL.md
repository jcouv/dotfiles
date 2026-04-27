---
name: linear-walkthrough
description: "Create or refresh a private PR review walkthrough in Markdown. Use when asked to write a reviewer brief, narrative PR walkthrough, grounded review notes, or a linear walkthrough of a PR. Triggers on: walkthrough this PR, write a PR walkthrough, reviewer brief, review narrative, linear walkthrough."
user-invocable: true
---

# Linear PR Walkthrough

Create a reviewer-facing walkthrough of a PR or local compare that is **narrative first** and **grounded in real evidence**.

The output is a private local Markdown file, not a GitHub review comment.

---

## The Job

Produce or refresh a `pr-review-*.md` file that helps a human reviewer understand the semantic core of a change.

The walkthrough should:

1. Start with a concise `## Reviewer Brief`
2. Turn `## Walkthrough` into a coherent narrative
3. Keep low-signal churn brief under `## Supporting Notes`
4. Cite real file paths throughout
5. Quote real inspected excerpts or diff hunks when they improve understanding

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
- Use existing helpers such as `scribe.cs --hunk --lines` or `scribe.cs --hunk --content` when practical
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

If the user gives an output path, use it.

Otherwise create a canonical Markdown file in the current working directory:

- GitHub PR: `pr-review-<owner>-<repo>-pr-<number>.md`
- Local compare: `pr-review-compare-<base>-vs-<head>.md`

Sanitize path segments to kebab-case.

If the file already exists, preserve the existing structure and update it in place instead of creating a second competing draft.

---

## Required Structure

The Markdown file should contain these top-level sections:

- `# ...` title
- `## Reviewer Brief`
- `## Walkthrough`
- `## Supporting Notes`

Use additional subheadings inside `## Walkthrough` when they help the narrative.

---

## Writing the Reviewer Brief

Refine `## Reviewer Brief` first.

Keep it short and evidence-based. Include:

- what changed
- why it matters
- which files or areas deserve the most attention
- a confidence note when intent is inferred rather than explicit

This should orient the reviewer before the detailed walkthrough begins.

---

## Writing the Walkthrough

Turn `## Walkthrough` into a reviewer-facing narrative.

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

Use `## Supporting Notes` for lower-signal churn:

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

Use `--lines` for local files and `--content` for diff-only hunks.

If direct file editing is simpler for a one-off fix to the Markdown structure, that is acceptable, but prefer the helper for grounded hunks.

---

## Guardrails

- Keep everything private and local unless the user explicitly asks for something else
- Do not post comments to GitHub
- Do not create a GitHub review on the user's behalf
- Do not claim the review is complete until the Markdown file itself contains the walkthrough
- Do not invent code, diff hunks, or intent

---

## Interactivity

If the user wants to keep exploring after the file is written, stay in reviewer-assistant mode:

- answer follow-up questions about the PR
- inspect related files or usage sites
- add more grounded excerpts
- refine the narrative if it drifted into detail

Treat the Markdown file as the artifact, but support an interactive review conversation around it.

---

## Completion Checklist

Before stopping, make sure:

- [ ] The output Markdown file exists
- [ ] `## Reviewer Brief` is concise and evidence-based
- [ ] `## Walkthrough` is narrative-first rather than a file-by-file dump
- [ ] Major claims are grounded in real inspected paths or excerpts
- [ ] `## Supporting Notes` holds lower-signal churn
- [ ] Any placeholder walkthrough text has been removed
