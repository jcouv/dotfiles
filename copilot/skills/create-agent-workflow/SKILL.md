---
name: create-agent-workflow
description: "Create a file-based C# agent workflow using the Agent Workflow Framework. Use when asked to set up an agent workflow, Ralph-style (checklist) workflow, builder&evaluator loop, or other multi-agent orchestration workflows."
user-invocable: true
---

# Create Agent Workflow

Create an Agent Workflow Framework app: a file-based C# program that references the framework project, keeps durable state in `state.json`, and orchestrates one or more agents.

An app consists of serializable state types, prompt-providing agent types (`Agent<TInput>` or `Agent<TInput, TOutput>`), and a workflow method that reads state, invokes agents, and saves the next state.

---

## Framework Overview

The framework is bundled with this skill under:

```text
framework\AgentWorkflow.csproj
```

When creating an app, reference it with `#:project` and an absolute path.

Core APIs:

- `WorkflowApp.RunAsync(...)`: parses command-line args, loads `state.json`, creates the journal, and starts the workflow.
- `JsonState<TState>`: reads and writes `state.json`.
- `Agent<TInput>`: void-returning agent (no output).
- `Agent<TInput, TOutput>`: agent with a result (the prompt must result in a JSON file that deserializes to `TOutput`).
- `AgentJournal`: records durable agent invocation folders.

JSON is serialized as camelCase and read case-insensitively.

The app owns the state model (`AppState` in examples below). The JSON state file is both the starting point and the observable, resumable checkpoint. Workflow code owns status progression: agents should report work done or return typed outputs, but the workflow decides and saves the next state.

---

## Standard App Shape

Create a `.cs` file in the target repository, usually under `.agent\<workflow-name>\`, and place `state.json` beside it:

Start it with:

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

using AgentWorkflow;

return await WorkflowApp.RunAsync<AppState>(args, runAsync: RunWorkflowAsync).ConfigureAwait(false);

static async Task RunWorkflowAsync(JsonState<AppState> state, AgentJournal journal)
{
    // Workflow logic: Read state, invoke agents, and save the next state.
}
```

Recommended layout:

```text
.agent\<workflow-name>\
  workflow.cs       C# workflow app using this framework
  state.json        serialized AppState checkpoint
  invocations\      framework-created agent invocation records
```

After creating `workflow.cs` and `state.json`, run a rubber-duck subagent to verify the workflow design is minimal and sufficient for the user's goal before running agents that can make changes.

Compile and run it with:

```powershell
dotnet run .\.agent\<workflow-name>\workflow.cs
```

Common runs:

```powershell
dotnet run .\.agent\<workflow-name>\workflow.cs -- --dry-run
dotnet run .\.agent\<workflow-name>\workflow.cs -- --show-agent-output
dotnet run .\.agent\<workflow-name>\workflow.cs -- --single-step
```

Agent invocations run Copilot with `--yolo --no-ask-user` so workflows can proceed without interactive prompts.

---

## Design Guidance

1. Keep `TState` explicit, serializable, and minimal: only durable information needed to resume and choose the next step.
2. Start with full-state JSON snapshots; do not invent partial update logic unless state size demands it.
3. Make the workflow method idempotent/resumable: it should be safe to restart from the top.
4. Confirm what information should pass from agent to agent at each workflow transition.
5. For typed-output agents, include the exact JSON shape in the prompt. For action-only agents, use `Agent<TInput>` and do not ask for `{}` output files.
6. Let evaluators inspect the real world: worktree, logs, artifacts, tests, and state. Builders build; evaluators decide; workflow code saves status.

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

This example triages one pending issue at a time. `no_repro` and `by_design` finish the item; `needs_fix` sends the item to the fixer; `blocked` stops that item.

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

Use this when one agent implements work and a separate evaluator accepts, requests changes, or blocks. This example retries until acceptance, blocking, or `MaxRounds`.

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

---

## Framework API Quick Reference

### `WorkflowApp`

```csharp
public static Task<int> WorkflowApp.RunAsync<TState>(
    string[] args,
    Func<JsonState<TState>, AgentJournal, Task> runAsync);
```

`RunAsync` derives paths from the folder containing the calling `workflow.cs`, loads `state.json`, creates an `AgentJournal`, then invokes the workflow. Supported options:

```text
--dry-run                   Load state, then exit without invoking agents.
--max-output-retries <n>    Retries for typed agent output. Default: 2.
--single-step               Exit after the next state checkpoint.
--show-agent-output         Do not pass -s to Copilot agent invocations.
```

### `JsonState<TState>`

```csharp
public sealed class JsonState<TState>
{
    public TState Value { get; }
    public Task SaveAsync(TState newValue);
}
```

`Value` is the loaded state. `SaveAsync` writes `state.json` atomically and updates `Value`.

### Agents

```csharp
public abstract class Agent<TInput>
{
    public string Name { get; }
    public abstract string Prompt(TInput input);
}
AgentInvocation invocation = await Agent.InvokeAsync<MyAgent, MyInput>(input, journal).ConfigureAwait(false);

public abstract class Agent<TInput, TOutput> : Agent<TInput>
{
}
MyOutput output = await Agent.InvokeAsync<MyAgent, MyInput, MyOutput>(input, journal).ConfigureAwait(false);
```

`Agent<TInput>` is action-only. `Agent<TInput, TOutput>` requires `output.json` that deserializes to `TOutput`.

### `AgentJournal` and `AgentInvocation`

Pass the `AgentJournal` from `RunAsync` to each `Agent.InvokeAsync`. Each invocation folder records:

```text
input.json       serialized input object passed to the agent
prompt.md        prompt generated by the agent type
transcript.txt   Copilot transcript for the run
invocation.json  metadata: id, agent name, paths, status, timestamps
output.json      typed output, only for Agent<TInput, TOutput>
```

Void-returning agent calls return an `AgentInvocation` with paths, status, agent name, input/output type names, and timestamps.

### JSON behavior

Framework JSON uses `WorkflowJsonSerializer.Options`: indented output, camelCase property names, case-insensitive reads, and `JsonStringEnumConverter(JsonNamingPolicy.CamelCase)`.
