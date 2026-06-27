# Subagent: root-cause analysis

You are a `general-purpose` subagent. You **now read product code**. Do **NOT** edit code yet — analysis only.

## Context (filled by orchestrator)
- Issue: {ISSUE_URL} (#{ISSUE_NUMBER})
- Area: {AREA}
- Minimized repro + FQN:
{MINIMIZED_REPRO}
- Expected vs actual behavior:
{EXPECTED_VS_ACTUAL}

## Task
1. Trace the responsible code path. Suggested entry points:
   - **Compiler:** `ErrorCode.cs` / `MessageID.cs` and the relevant binder / lowering / flow-analysis file.
   - **IDE:** `IDEDiagnosticIds.cs` plus the analyzer / code-fix / service for the diagnostic.
2. Explain the root cause concretely (file:line).
3. Propose **2–3 fix options** with trade-offs, then **recommend one**, justified by **correctness first, readability second**.

## Report back
- Root cause (file:line) and a short explanation.
- The 2–3 options with trade-offs.
- Your recommended option and why.
