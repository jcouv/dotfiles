---
name: roslyn-bug-fix
description: "Drive a Roslyn compiler/IDE bug from a GitHub issue to an accepted fix using a repro-first, subagent-orchestrated pipeline (repro → baseline commit → root-cause → fix → evaluate → summary). Use when asked to fix a dotnet/roslyn issue, reproduce a Roslyn bug as a unit test, or run the bug-fix loop on an issue number."
user-invocable: true
argument-hint: "<roslyn issue number> (e.g. 81679)"
---

# Roslyn Bug Fix

Orchestrate a single `dotnet/roslyn` bug fix. You are the **orchestrator**: you own setup, the journal, commits, and the fixer↔evaluator loop. You **delegate the thinking-heavy steps to subagents** (Task tool, `general-purpose`) so each works in a clean context with a focused, self-contained prompt.

Core principles, in priority order: **correctness > readability > minimal diff**. The fix is not done until a repro test goes red→green, all changed product code is covered by tests, and the broader suite shows no regressions.

Run in the local roslyn checkout (default `Q:\repos\roslyn`; confirm before assuming). Operate on **one issue** per skill invocation.

---

## Setup (orchestrator, once)

1. **Resolve the issue.** `gh issue view <n> --repo dotnet/roslyn --json title,body,labels,comments`. Determine area from labels: `Area-Compilers` → compiler, `Area-IDE`/`Area-Analyzers` → IDE.
2. **Working branch.** From an up-to-date base: `git switch -c fix-issue-<n>-<slug>`.
3. **Journal.** Create `.agent/roslyn-bug-fix/issue-<n>/journal.md` and keep it **untracked** by appending `/.agent/roslyn-bug-fix/` to `.git/info/exclude`. Never `git add` the journal or the `.agent` dir.
4. Append a journal **Setup** entry (issue link, area, branch, base SHA).

> **Journal everything.** After *every* step below, append a dated section: step name, actor (orchestrator / which subagent), what happened, key decisions, learnings, dead-ends. The journal is the durable record — write to it before moving on.

---

## Pipeline

### 1 — Read the issue (orchestrator)
Summarize the expected vs actual behavior and the minimal trigger into the journal. Extract any code snippet the reporter gave. Note: repro snippets may live behind 3rd-party links or msft-internal complogs — if the repro is not self-contained, reconstruct it from the description.

### 2 — Create a repro test — BLACK BOX (subagent)
Delegate to a `general-purpose` subagent. **Hard rule: it must NOT read Roslyn product code** — only existing *test* files to learn conventions. The repro is written purely from the issue's described behavior, so it is an honest, independent reproduction.

Subagent prompt must include:
- The issue's expected vs actual behavior.
- Where to add the test:
  - **Compiler:** a `[Fact]` in the most relevant existing test class, inheriting `CSharpTestBase`/`VisualBasicTestBase`. Use raw string literals (`"""..."""`) for source. Assert current (buggy) behavior with `comp.VerifyEmitDiagnostics(...)` / `VerifyDiagnostics(...)` so the wrong output is explicit.
  - **IDE/analyzer:** use the area's existing harness (`TestInRegularAndScriptAsync` / `TestMissingInRegularAndScriptAsync`, or the analyzer/code-fix test verifier for that diagnostic id).
- Add `[Fact, WorkItem("https://github.com/dotnet/roslyn/issues/<n>")]`.
- Build & run ONLY the new test; confirm it **passes while asserting the buggy behavior** (or fails in exactly the way the issue describes). Report the test's fully-qualified name and exact observed output.

Verify the subagent did not touch product code (`git diff --name-only`).

### 3 — Simplify the repro (subagent)
Delegate (still black-box). Reduce to the smallest source/assertion that still demonstrates the bug with a single diagnostic if possible. Re-run to confirm it still reproduces. Journal the minimized repro.

### 4 — Baseline commit (orchestrator)
Stage only the test file(s) and commit the **bug-demonstrating** baseline: `git commit -m "Add failing repro for #<n>: <title>"`. This snapshot encodes current (wrong) behavior so the fix's effect is reviewable as a diff. Record the SHA in the journal.

### 5 — Root-cause analysis (subagent)
Delegate to a `general-purpose` subagent that **now reads product code**. Give it the issue, the minimized repro, and the test's FQN. It must:
- Trace the responsible code path (start points: `ErrorCode.cs`/`MessageID.cs` and the relevant binder/lowering/flow file for compiler; `IDEDiagnosticIds.cs` + the analyzer/code-fix/service for IDE).
- Explain the root cause concretely (file:line).
- Propose **2–3 fix options** with trade-offs, then **recommend one**, justified by correctness first, readability second.
- NOT edit code yet — analysis only.
Record the options and recommendation in the journal. Orchestrator confirms the recommended option (ask the user only if genuinely ambiguous or risky).

### 6 — Fix + update test (fixer subagent)
Delegate to a `general-purpose` **fixer**. Inputs: chosen option, repro FQN, root-cause notes, and any evaluator feedback from a prior loop. It must:
- **Update the repro test** to assert the now-correct behavior, and add cases for important edges surfaced during analysis.
- Build the area (`Compilers.slnf` or `Ide.slnf`) and run the affected test(s); confirm red→green.
Orchestrator commits progress: `git commit -m "Fix #<n>: <short description>"`. Journal what changed and why.

### 7 — Evaluate (evaluator subagent + rubber-duck review)
Evaluation has **two parts**; run both each round and combine their findings.

**7a — Mechanical evaluation.** Delegate to a **fresh** `general-purpose` **evaluator** (no fixer context beyond the diff). It must check, against priorities correctness > readability > minimal diff:
- The repro now asserts correct behavior and genuinely fails without the product change (have it revert product hunks via stash/scratch worktree to confirm, then restore).
- Read the logic around the changed product code to identify any interesting scenarios or interactions that should be covered by tests for thoroughness. Add any such exploratory tests and confirm they pass.
- **Every** changed product line and logic branch is covered by a test.
- The change is the simplest, most readable form of the chosen fix; no unrelated churn; resources/xlf/generated files consistent.
- **No stale issue references.** Scan the diff and touched files for mentions of *this* resolved issue's URL or `#<n>` left in code or comments as reminders (e.g. `// see https://github.com/dotnet/roslyn/issues/<n>`, `PROTOTYPE`/TODO-style notes pointing at it). We place such URLs in code as reminders, so once the issue is fixed they should be removed. **Exception:** `WorkItem("...issues/<n>")` test attributes (and similar intentional work-item references) are *not* reminders — they stay.
- **No regressions**: run the relevant test project(s) for the touched area; spot-check obviously related suites.

**7b — Rubber-duck review.** Also delegate the diff to a `rubber-duck` agent (Task tool, `rubber-duck` type) to catch logic errors, missed edge cases, and design flaws the author and the mechanical pass may have overlooked. Give it the issue, the chosen fix option, and the branch diff (`git diff <base>..HEAD`); ask for bugs/correctness/edge-case concerns only (it already ignores style/formatting). Fold any genuine issues it raises into the verdict.

Combine 7a + 7b: output **exactly** `ACCEPTED` (only if both passes are clean) or a single numbered list of concrete, actionable feedback. Append both the mechanical result and the rubber-duck findings to the journal.

### 8 — Loop (orchestrator)
If the verdict is not `ACCEPTED`, hand the numbered feedback back to the **fixer** (step 6) and re-evaluate (step 7). Keep iterating until `ACCEPTED`; journal each round. If the loop stalls (≈3 rounds with no progress), pause and surface the blocker to the user.

### 9 — Summary (orchestrator)
Once `ACCEPTED`, write a concise HTML summary to present: root cause, the fix and why it was chosen over alternatives, tests added/updated, files changed, validation run, and any follow-ups. Offer next steps (push branch, open a **draft** PR referencing `Fixes #<n>`). Confirm the push remote with the user before pushing, and always create the PR as a draft (`gh pr create --draft`).

---

## Subagent prompting notes
- Each subagent is **stateless** — embed all needed context (issue text, repro FQN, file paths, prior feedback) in the prompt; don't assume shared memory.
- Enforce the **black-box boundary** in steps 2–3: the repro author must not look at product code, so the reproduction stays independent of the implementation.
- Keep the **evaluator independent** from the fixer (separate invocation, judge the diff, not the reasoning) so it can catch the fixer's blind spots.
- Commits are made by the **orchestrator** with explicit file paths — never `git add -A` (keeps the journal/`.agent` out of history). Do **not** add `Co-authored-by` trailers.

## Quick reference (roslyn)
- Build: `dotnet build Compilers.slnf` · `dotnet build Ide.slnf`
- Run one test: `dotnet test <test.csproj> --framework net10.0 --filter "FullyQualifiedName~<Name>"`
- Compiler tests assert via `comp.VerifyEmitDiagnostics()`; prefer raw string literals and `.Single()`.
- After `.resx` edits: `dotnet msbuild <proj> /t:UpdateXlf`. After `Syntax.xml`/`BoundNodes.xml`: `dotnet run --file eng/generate-compiler-code.cs`.
- Update `PublicAPI.Unshipped.txt` when public APIs change.
