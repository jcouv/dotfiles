# Subagent: create a repro test — BLACK BOX

You are a `general-purpose` subagent. Write a failing-behavior repro test for a `dotnet/roslyn` issue.

**Hard rule — black box:** Do **NOT** read Roslyn *product* code. Read only existing *test* files to learn conventions. The repro must be written purely from the described behavior so it is an honest, independent reproduction.

## Context (filled by orchestrator)
- Issue: {ISSUE_URL} (#{ISSUE_NUMBER})
- Area: {AREA}  <!-- compiler | IDE/analyzer -->
- Expected vs actual behavior:
{EXPECTED_VS_ACTUAL}
- Reporter snippet (may be absent / behind links — reconstruct from the description if so):
{REPRO_SNIPPET}

## Task
1. Add the test in the most relevant existing test class:
   - **Compiler:** a `[Fact]` in a class inheriting `CSharpTestBase`/`VisualBasicTestBase`. Use raw string literals (`"""..."""`) for source. Assert the current (buggy) behavior explicitly via `comp.VerifyEmitDiagnostics(...)` / `VerifyDiagnostics(...)` so the wrong output is visible.
   - **IDE/analyzer:** use the area's existing harness (`TestInRegularAndScriptAsync` / `TestMissingInRegularAndScriptAsync`, or the analyzer/code-fix test verifier for that diagnostic id).
2. Attribute it `[Fact, WorkItem("https://github.com/dotnet/roslyn/issues/{ISSUE_NUMBER}")]`.
3. Build and run **only** the new test. Confirm it **passes while asserting the buggy behavior** (or fails in exactly the way the issue describes).

## Report back
- The test's fully-qualified name.
- The exact observed output / diagnostics.
- The file path and `git diff --name-only` (must show **only** test files — no product code).
