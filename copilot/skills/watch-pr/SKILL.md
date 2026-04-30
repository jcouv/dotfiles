---
name: watch-pr
description: "Monitor CI on a pull request in the background and notify when checks finish or fail fast. Use when the user wants to watch a PR after pushing, get notified about CI failures, or asks to monitor checks. Triggers on: watch the PR, monitor CI, monitor the PR, watch CI, ping me when CI is done, watch checks."
user-invocable: true
---

# Watch PR

Monitor CI on a pull request in the background. When the watch completes (CI passes, fails, or hits an unexpected state), proactively report back to the user. On failure, automatically invoke the `ci-analysis` skill to surface the relevant test/build failures.

---

## The Job

Delegate the entire "watch, report, investigate" flow to a background sub-agent using a **cheap model** so premium tokens are not spent on idle waiting or CI failure investigation. The main agent only spends a small dispatch turn at the start and a small surface turn at the end.

The sub-agent runs `gh pr checks <pr> --watch --fail-fast --interval 900` and waits for completion. The `--interval 900` polls every 15 minutes (low rate-limit footprint, fine for hour-scale CI). The `--fail-fast` exits on first check failure so the user hears about problems quickly.

When the sub-agent observes the exit, it reports back. On failure, it invokes the `ci-analysis` skill itself (in cheap-model context) before returning so the main agent receives a ready-to-surface summary.

---

## Token Cost

- **Wait phase:** Zero model tokens. The sub-agent is idle waiting on the shell command; no thinking happens until the command exits.
- **Launch phase (main agent):** ~few hundred premium tokens to dispatch.
- **Report phase (sub-agent, cheap model):** ~few hundred to a few thousand cheap tokens for exit-code interpretation. On failure, additional cheap tokens for `ci-analysis` investigation (which is normally the largest cost).
- **Surface phase (main agent):** ~few hundred premium tokens to relay the sub-agent's summary to the user.

This pushes the bulk of the spend onto the cheap model while keeping the user-facing summary in the main agent's voice.

---

## Resolving the PR

Try in order, without asking the user unless all options fail:

1. If the user gave a PR number or URL in the prompt, use it.
2. Otherwise, if the current branch has an associated PR, derive it via `gh pr view --json number -q .number`.
3. Otherwise, ask the user which PR to watch.

When constructing the `gh pr checks` command, prefer passing the explicit PR number (or URL) rather than relying on branch lookup, so the watch is unambiguous if the user later checks out a different branch.

---

## Launching the Watch

Use the `task` tool with `agent_type: "task"` (Haiku-by-default, optimized for "run and report success/failure") and `mode: "background"`. Explicitly set `model: "claude-haiku-4.5"` (or another cheap model the user prefers) to make the cost intent clear and to override any default that may shift over time.

The sub-agent prompt should:

1. Run `gh pr checks <pr> --watch --fail-fast --interval 900` (with `--repo` if needed)
2. Observe the exit code
3. On exit `0`: return a one-line "CI passed on PR #N" summary
4. On exit `1`: invoke the `ci-analysis` skill on the PR URL, then return a concise failure summary (failed leg names, top error excerpts) so the main agent does not need to re-investigate
5. On exit `8` or other: return the raw exit code and a short snippet of captured output

Sample dispatch:

```text
agent_type: "task"
mode: "background"
model: "claude-haiku-4.5"
name: "watch-pr-83275"
prompt:
  Run `gh pr checks 83275 --repo dotnet/roslyn --watch --fail-fast --interval 900`
  in the repo's working directory and wait for it to exit. Then:
  - exit 0: respond "CI passed on dotnet/roslyn#83275".
  - exit 1: invoke the ci-analysis skill on https://github.com/dotnet/roslyn/pull/83275
    and return a concise failure summary (failed leg names, top errors,
    whether matched to known issues).
  - other: return the exit code and a short tail of stdout/stderr.
```

After dispatching, briefly tell the user the watch has started, mention the cheap model in use, and end your turn. Do not wait. The completion notification will arrive automatically.

---

## Optional: Detached PowerShell Fallback

If the user explicitly wants the watch to survive a CLI restart (background sub-agents may not), fall back to launching `gh pr checks ... --watch ...` as a `mode: "async"` PowerShell command with `detach: true`. The trade-off: the main agent (premium model) handles the report and any `ci-analysis` invocation, so failures cost more.

Use this fallback only on explicit user request. The default is the cheap-model sub-agent flow above.

---

## When the Sub-Agent Completes

The completion notification arrives with the sub-agent's final response. Use `read_agent` with `wait: true` to retrieve the summary it prepared.

Surface it to the user verbatim or with minimal rephrasing. Do not re-run `ci-analysis` from the main context — the sub-agent has already done that work in the cheap model and packaged the result.

If the sub-agent reports an unexpected exit code or its summary looks incomplete, then it is reasonable to follow up (send `write_agent` for a clarification, or run a small targeted investigation in the main context). Otherwise just relay.

---

## Watching Multiple PRs

If the user asks to watch several PRs at once, dispatch one cheap sub-agent per PR. Each completes and notifies independently. Use clearly distinct `name` values (e.g., `watch-pr-83275`, `watch-pr-83276`) so notifications are easy to attribute.

---

## Re-launching After New Commits

If the user pushes a new commit while a watch is running, the previous watch will exit (since the old checks complete) and the new commit's checks will not be watched. That is expected. After reporting the prior result, ask whether to re-launch the watch on the new commit.

---

## Guardrails

- Do **not** post comments to GitHub on the user's behalf.
- Do **not** retry or "fix" CI failures unless explicitly asked. The job is to monitor and surface, not to act.
- If `gh` is not authenticated, surface the error clearly rather than silently failing.
- When the user is offline or `gh` cannot reach GitHub, the watch will exit with a non-zero code. Report this distinctly from a real CI failure.

---

## Completion Checklist

Before considering the initial launch turn done:

- [ ] PR number/URL is resolved
- [ ] Background sub-agent is dispatched with `agent_type: "task"`, `mode: "background"`, and explicit cheap `model`
- [ ] Sub-agent prompt includes the exit-code branching logic (including auto-invoking `ci-analysis` on failure)
- [ ] User has been told the watch is running, the polling interval, and the model in use
- [ ] No further tool calls until the completion notification arrives

When the notification arrives:

- [ ] Sub-agent summary is read via `read_agent`
- [ ] User receives a concise relay
- [ ] Main agent does not redo `ci-analysis` (the sub-agent already did it)
