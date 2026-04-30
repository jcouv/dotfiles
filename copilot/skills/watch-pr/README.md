# watch-pr

This skill monitors CI on a pull request via a **background sub-agent running on a cheap model**. When CI finishes (or fails fast), the sub-agent observes the exit and — on failure — auto-invokes the `ci-analysis` skill in its own cheap-model context. The main agent is only re-engaged briefly to surface the summary, keeping premium token spend minimal.

Built around `gh pr checks --watch --fail-fast --interval 900` (15-minute polling, exits on first failing check).

## Files

- `SKILL.md` - skill metadata and instructions

## Usage

```
/watch-pr 83275
/watch-pr https://github.com/dotnet/roslyn/pull/83275
watch CI on this PR    # auto-derives PR from current branch
```

## Token cost

- Wait phase: zero model tokens (sub-agent is idle on the shell command)
- Sub-agent reporting + ci-analysis (on failure): cheap model
- Main agent dispatch + final relay: small premium spend
