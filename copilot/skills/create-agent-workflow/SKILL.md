---
name: create-agent-workflow
description: "Create a file-based C# agent workflow using the Agent Workflow Framework. Use when asked to set up an agent workflow, Ralph-style (checklist) workflow, builder&evaluator loop, or other multi-agent orchestration workflows."
user-invocable: true
---

# Create Agent Workflow

Create an Agent Workflow Framework app: a file-based C# program that references the framework project and orchestrates one or more agents with durable JSON state.

---

## Framework Overview

The Agent Workflow Framework is bundled with this skill under:

```text
framework\AgentWorkflow.csproj
```

When creating an app, resolve that to the absolute path of this skill installation.

The framework provides:

- `WorkflowApp.RunAsync(...)`: entrypoint to parse the command-line args and start the workflow.
- `JsonState<TState>`: loads and saves an arbitrary app-defined JSON state object.
- `Agent<TInput>`: action-only agent, no structured output file.
- `Agent<TInput, TOutput>`: typed-output agent whose prompt must result in a JSON file that deserializes to `TOutput`.
- `AgentJournal`: records durable agent invocation folders with input, prompt, transcript, optional output, and invocation metadata.

Each agent invocation writes `input.json`, `prompt.md`, `transcript.txt`, and `invocation.json`. Typed-output agents also write `output.json`.
`JsonState<TState>.SaveAsync(...)` writes `state.json` atomically and updates `state.Value` to the saved value.
JSON is serialized as camelCase and read case-insensitively.

The app defines a state object model (`AppState` in examples below) and a corresponding JSON state file (`state.json`) to populate it.
The state file is the starting point for the state, and also serves as an observable and resumable checkpoint.
The app initializes the framework and runs a workflow. As part of that workflow, it may read the state, call agents (defined as prompts) and update the state.

Best practice: workflow code owns all status field progression. Status fields control workflow progression, so agents should report work done or return typed outputs, but they should not decide or mutate the next status. The workflow should inspect agent results and save the next `AppState`.

---

## Standard App Shape

Create a `.cs` file in the target repository, usually under `.agent\<workflow-name>\`.

Start it with:

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

using AgentWorkflow;

return await WorkflowApp.RunAsync<AppState>(args, runAsync: RunWorkflowAsync).ConfigureAwait(false);

static async Task RunWorkflowAsync(JsonState<AppState> state, AgentJournal journal)
{
    // Workflow logic goes here:
    // - read state
    // - invoke agents
    // - save state
    // - loop and conditional control flow
}
```

Recommended file structure:

```text
.agent\<workflow-name>\
  workflow.cs       C# workflow app using this framework
  state.json        serialized AppState checkpoint
  invocations\      framework-created agent invocation records
```

The framework uses folder and file naming conventions: file `state.json` and subfolder `invocations\` must be in the same folder as `workflow.cs`.
`WorkflowApp.RunAsync<TState>(...)` deserializes `state.json` into the requested `TState` before it calls the workflow method.
After creating `workflow.cs` and `state.json`, run a rubber-duck subagent to verify the workflow design is minimal and sufficient for the user's goal before running agents that can make changes.

Compile and run it with:

```powershell
dotnet run .\.agent\<workflow-name>\workflow.cs
```

For validation without invoking agents, use the `--dry-run` option. It compiles the C# file, loads `state.json`, verifies the state can deserialize as `AppState`, and exits before workflow logic can invoke agents.

Useful options:

```powershell
dotnet run .\.agent\<workflow-name>\workflow.cs -- --show-agent-output
```

Note: agent invocations run Copilot with `--yolo --no-ask-user` so workflows can proceed without interactive prompts.

---

## Design Guidance

1. Keep `TState` explicit and serializable.
2. Start with full-state JSON snapshots; do not invent partial update logic unless state size demands it.
3. Keep `TState` minimal. `state.json` should hold only the durable information needed to resume the workflow and choose the next step.
4. Confirm with the user what information should be passed from agent to agent at each workflow transition.
5. Make the workflow method idempotent/resumable: it should be safe to restart from the top.
6. Keep app status strings app-owned. The framework should not interpret them, and agents should not choose or mutate them.
7. For typed-output agents, include the exact JSON shape in the prompt.
8. For action-only agents, use `Agent<TInput>` and do not ask for `{}` output files.
9. Let evaluators inspect the real world: worktree, logs, artifacts, tests, and state.
10. Avoid letting builders self-accept. Builders build; evaluators decide; workflow code saves status.

---

## End-to-End Example: Minimal Empty Workflow

Use this as the smallest file-based app that compiles, loads `state.json`, and exits without invoking agents.

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

using AgentWorkflow;

return await WorkflowApp.RunAsync<EmptyState>(args, RunWorkflowAsync).ConfigureAwait(false);

static Task RunWorkflowAsync(JsonState<EmptyState> state, AgentJournal journal)
{
    return Task.CompletedTask;
}

public sealed record EmptyState;
```

Place this `state.json` next to `workflow.cs`:

```json
{}
```

---

## End-to-End Example: Triage and Fix Checklist

This example models a checklist of issue IDs. The workflow triages one pending issue at a time. If triage returns `no_repro` or `by_design`, the workflow marks the item done and the next run moves to the next item. Otherwise, the workflow marks the item as needing a fix; the next run invokes the fixer agent. The fixer reports either that a PR was opened or that the fix was abandoned.

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

using AgentWorkflow;

return await WorkflowApp.RunAsync<ChecklistState>(args: args, runAsync: RunWorkflowAsync).ConfigureAwait(false);

static async Task RunWorkflowAsync(JsonState<ChecklistState> state, AgentJournal journal)
{
    while (PickIssueNeedingWork(state.Value) is { } item)
    {
        if (item.Status == IssueStatus.Pending)
        {
            var triage = await Agent.InvokeAsync<TriageAgent, TriageInput, TriageOutput>(
                new TriageInput(item),
                journal).ConfigureAwait(false);

            var nextStatus = triage.Decision switch
            {
                TriageDecision.NoRepro => IssueStatus.Done,
                TriageDecision.ByDesign => IssueStatus.Done,
                TriageDecision.NeedsFix => IssueStatus.NeedsFix,
                TriageDecision.Blocked => IssueStatus.Blocked,
                _ => throw new InvalidOperationException($"Unknown triage decision '{triage.Decision}'.")
            };

            await state.SaveAsync(state.Value.SetStatus(item.Id, nextStatus, triage)).ConfigureAwait(false);
            continue;
        }

        if (item.Status == IssueStatus.NeedsFix)
        {
            var triage = item.LastTriage
                ?? throw new InvalidOperationException($"Item '{item.Id}' needs a fix but has no triage result.");

            var fix = await Agent.InvokeAsync<FixerAgent, FixerInput, FixerOutput>(
                new FixerInput(item, triage),
                journal).ConfigureAwait(false);

            await state.SaveAsync(state.Value.SetStatus(item.Id, IssueStatus.Done, fix: fix)).ConfigureAwait(false);
        }
    }
}

static ChecklistItemState? PickIssueNeedingWork(ChecklistState checklistState)
{
    return checklistState.Items.FirstOrDefault(
        static item => item.Status is IssueStatus.Pending or IssueStatus.NeedsFix);
}

public static class IssueStatus
{
    public const string Pending = "pending";
    public const string NeedsFix = "needs_fix";
    public const string Done = "done";
    public const string Blocked = "blocked";
}

public static class TriageDecision
{
    public const string NoRepro = "no_repro";
    public const string ByDesign = "by_design";
    public const string NeedsFix = "needs_fix";
    public const string Blocked = "blocked";
}

public sealed record ChecklistState(
    IReadOnlyList<ChecklistItemState> Items);

public sealed record ChecklistItemState(
    string Id,
    string IssueId,
    string Title,
    string Status,
    TriageOutput? LastTriage,
    FixerOutput? LastFix);

public sealed record TriageInput(
    ChecklistItemState Item);

public sealed record TriageOutput(
    string Decision);

public sealed record FixerInput(
    ChecklistItemState Item,
    TriageOutput Triage);

public sealed record FixerOutput(
    string Outcome,
    string? PullRequestUrl);

public sealed class TriageAgent : Agent<TriageInput, TriageOutput>
{
    public override string Prompt(TriageInput input) => $$"""
        You are the Triage agent.

        Triage issue {{input.Item.IssueId}}: {{input.Item.Title}}.

        Return a decision of no_repro, by_design, needs_fix, or blocked.

        Write a JSON file matching this shape:

        {
          "decision": "no_repro | by_design | needs_fix | blocked"
        }

        ## Triage guidance
        ...
        """;
}

public sealed class FixerAgent : Agent<FixerInput, FixerOutput>
{
    public override string Prompt(FixerInput input) => $$"""
        You are the Fixer agent.

        Fix issue {{input.Item.IssueId}}: {{input.Item.Title}}.

        Report either that a PR was opened or that the fix was abandoned.

        Write a JSON file matching this shape:

        {
          "outcome": "pr_opened | abandoned",
          "pullRequestUrl": "string or null"
        }

        ## Fixing guidance
        ...
        """;
}

public static class ChecklistStateExtensions
{
    public static ChecklistState SetStatus(
        this ChecklistState state,
        string itemId,
        string status,
        TriageOutput? triage = null,
        FixerOutput? fix = null)
    {
        return state with
        {
            Items = state.Items
                .Select(item => item.Id == itemId
                    ? item with
                    {
                        Status = status,
                        LastTriage = triage ?? item.LastTriage,
                        LastFix = fix ?? item.LastFix
                    }
                    : item)
                .ToArray()
        };
    }
}
```

Place this `state.json` next to `workflow.cs`:

```json
{
  "items": [
    {
      "id": "issue-123",
      "issueId": "123",
      "title": "Fix crash on malformed input",
      "status": "pending",
      "lastTriage": null,
      "lastFix": null
    },
    {
      "id": "issue-456",
      "issueId": "456",
      "title": "Investigate formatting regression",
      "status": "pending",
      "lastTriage": null,
      "lastFix": null
    }
  ]
}
```

---

## Builder/Evaluator Pattern

Use this when one agent should implement work and a separate evaluator should decide whether the work is accepted.

This example retries builder/evaluator rounds until the evaluator accepts, blocks, or the workflow reaches `MaxRounds`.

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

using AgentWorkflow;

const int MaxRounds = 3;

return await WorkflowApp.RunAsync<BuildReviewState>(args, RunWorkflowAsync).ConfigureAwait(false);

static async Task RunWorkflowAsync(JsonState<BuildReviewState> state, AgentJournal journal)
{
    while (state.Value.Status is ReviewStatus.Pending or ReviewStatus.ChangesRequested)
    {
        if (state.Value.Round >= MaxRounds)
        {
            await state.SaveAsync(state.Value with { Status = ReviewStatus.Failed }).ConfigureAwait(false);
            return;
        }

        var nextRound = state.Value.Round + 1;
        await Agent.InvokeAsync<BuilderAgent, BuilderInput>(
            new BuilderInput(state.Value.Item, nextRound, state.Value.LastEvaluation),
            journal).ConfigureAwait(false);

        var evaluation = await Agent.InvokeAsync<EvaluatorAgent, EvaluatorInput, EvaluatorOutput>(
            new EvaluatorInput(state.Value.Item, nextRound),
            journal).ConfigureAwait(false);

        var nextStatus = evaluation.Decision switch
        {
            EvaluationDecision.Accepted => ReviewStatus.Done,
            EvaluationDecision.ChangesRequested => ReviewStatus.ChangesRequested,
            EvaluationDecision.Blocked => ReviewStatus.Blocked,
            _ => throw new InvalidOperationException($"Unknown evaluator decision '{evaluation.Decision}'.")
        };

        await state.SaveAsync(state.Value with
        {
            Status = nextStatus,
            Round = nextRound,
            LastEvaluation = evaluation
        }).ConfigureAwait(false);

        if (nextStatus is ReviewStatus.Done or ReviewStatus.Blocked)
            return;
    }
}

public static class ReviewStatus
{
    public const string Pending = "pending";
    public const string ChangesRequested = "changes_requested";
    public const string Done = "done";
    public const string Blocked = "blocked";
    public const string Failed = "failed";
}

public static class EvaluationDecision
{
    public const string Accepted = "accepted";
    public const string ChangesRequested = "changes_requested";
    public const string Blocked = "blocked";
}

public sealed record BuildReviewState(
    BuilderEvaluatorItemState Item,
    string Status,
    int Round,
    EvaluatorOutput? LastEvaluation);

public sealed record BuilderEvaluatorItemState(
    string Id,
    string Title);

public sealed record BuilderInput(
    BuilderEvaluatorItemState Item,
    int Round,
    EvaluatorOutput? PreviousEvaluation);

public sealed record EvaluatorInput(
    BuilderEvaluatorItemState Item,
    int Round);

public sealed record EvaluatorOutput(
    string Decision,
    string Feedback);

public sealed class BuilderAgent : Agent<BuilderInput>
{
    public override string Prompt(BuilderInput input) => $$"""
        You are the Builder.

        Implement item {{input.Item.Id}}: {{input.Item.Title}}.
        This is round {{input.Round}}.
        Address prior evaluator feedback if present.

        ## Evaluator feedback
        {{input.PreviousEvaluation?.Feedback}}

        ...
        """;
}

public sealed class EvaluatorAgent : Agent<EvaluatorInput, EvaluatorOutput>
{
    public override string Prompt(EvaluatorInput input) => $$"""
        You are the Evaluator.

        Verify item {{input.Item.Id}}: {{input.Item.Title}}.
        This is round {{input.Round}}.
        Be skeptical of the Builder's work.

        Return a decision of accepted, changes_requested, or blocked.
        Do not edit implementation files.

        Write a JSON file matching this shape:

        {
          "decision": "accepted | changes_requested | blocked",
          "feedback": "string"
        }

        ...
        """;
}
```
