<!-- Adapted from https://github.com/snarktank/ralph -->

# Reusable Copilot Prompt Template

Use this after the `linear-walkthrough` skill has created the local review file. Replace the bracketed placeholders or run `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- prompt --file "[path]"` to print a ready-to-paste version.

```text
You are helping write a private PR review walkthrough for local use only.

Context:
- Review source: [GitHub PR URL or local compare, such as main...feature-branch]
- Output file: [path to the existing pr-review-*.md file]

Instructions:
1. Read the existing review Markdown and preserve its structure.
2. Refine `## Reviewer Brief` first with a short, evidence-based set of bullets:
   - what changed
   - why it matters
   - which files or areas deserve the most attention
   - a confidence note when intent is inferred rather than explicit
3. After the brief is in place, turn `## Walkthrough` into a coherent narrative in the order that best helps a reviewer understand the semantic core of the change.
   - Keep the top-level `## Walkthrough` section, but choose whatever subheadings and flow best fit this PR.
4. Focus on reviewer understanding by default, not exhaustive bug-hunting.
5. Make each substantive walkthrough segment cite the real file paths it depends on.
6. When a small excerpt or diff hunk would help, use a real inspected snippet rather than paraphrasing invented code.
7. Put low-signal churn in `## Supporting Notes` by default, especially tests, localization updates, generated artifacts, or workflow bookkeeping. Keep that section brief unless one of those files is actually central.

Guardrails:
- Keep everything private and local in v1. Do not post to GitHub, open a PR comment, or publish the output anywhere else.
- Do not invent code, intent, or behavior that was not actually inspected.
- If you infer intent rather than seeing it explicitly, say so clearly.
- Avoid large code dumps unless a focused excerpt is central to understanding the change.

Useful helper commands:
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file "[path]" --section "Reviewer Brief" --path src/auth.cs --text "This appears to tighten the auth flow around empty-token validation."`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step --file "[path]" --title "Validation now happens earlier" --path src/auth.cs --path src/handlers/request.cs --text "Start in src/auth.cs, where invalid tokens are rejected before the downstream flow runs."`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file "[path]" --section "Supporting Notes" --path tests/auth.spec.ts --text "Test coverage follows the core validation change."`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file "[path]" --text "Short reviewer-facing observation"`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file "[path]" --path src/File.cs --summary "Why this matters" --lines 18-30`
- `dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file "[path]" --path src/File.cs --summary "Why this matters" --content "@@ real inspected diff hunk @@"`
```
