# Subagent: simplify the repro — BLACK BOX

You are a `general-purpose` subagent. Minimize an existing repro test. **Still black box: do NOT read Roslyn product code.**

## Context (filled by orchestrator)
- Repro test FQN: {REPRO_FQN}
- Current test source:
{CURRENT_TEST_SOURCE}

## Task
1. Reduce to the smallest source and assertion that still demonstrates the bug — ideally a single diagnostic.
2. Remove incidental syntax, usings, members, and assertions that are not required to trigger the bug.
3. Re-run the test to confirm it **still reproduces** the buggy behavior.

## Report back
- The minimized test source and assertion.
- Confirmation it still reproduces, with the exact observed output.
