---
name: create-agent-workflow
description: "Create a file-based C# agent workflow using the Agent Workflow Framework. Use when asked to set up an agent workflow, Ralph-style (checklist) workflow, builder&evaluator loop, or other multi-agent orchestration workflows."
user-invocable: true
---

# Create Agent Workflow

Create an Agent Workflow Framework app: a file-based C# program that references the framework project, keeps durable state in `state.json`, and orchestrates one or more agents.

An app consists of serializable state types, prompt-providing agent types (`AgentAction<TAgent, TInput>` or `AgentFunc<TAgent, TInput, TOutput>`), and a workflow method that reads state, invokes agents, and saves the next state.

---

## Framework Overview

The framework provides:
- standardized agent invocation pattern:  
  Agents are presented as strongly-typed methods (with input and output types) to be invoked.  
  Each agent runs with a fresh context window.  
  It handles prompt generation, Copilot invocation, output parsing, and journaling.
- durable state management:  
  `state.json` as the single source of truth for the workflow's current state, enabling resumability and checkpointing.  
- readable workflow logic:  
  The workflow method is a normal C# async method, making it easy to read and write complex orchestration logic with loops, conditionals, and error handling.

The framework is bundled with this skill under:

```text
framework\AgentWorkflow.csproj
```

When creating an app, reference it with `#:project` and an absolute path.

Core APIs:

- `WorkflowApp.RunAsync(...)`: parses command-line args, loads `state.json`, creates the journal, and starts the workflow.
- `JsonState<TState>`: reads and writes `state.json`.
- `AgentAction<TAgent, TInput>`: void-returning agent (no output).
- `AgentFunc<TAgent, TInput, TOutput>`: value-returning agent (the prompt must result in a JSON file that deserializes to `TOutput`).
- `AgentJournal`: records durable agent invocation folders.

The app owns the state model (`AppState` in examples below). The JSON state file is both the starting point and the observable, resumable checkpoint. Workflow code owns status progression: agents should report work done or return values, but the workflow decides and saves the next state.

---

## Standard App Shape

Create a `.cs` file in the target repository, usually under `.agent\<workflow-name>\`:

Start it with:

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

#pragma warning disable CA2007 // Consider calling ConfigureAwait on the awaited task

using AgentWorkflow;

return await WorkflowApp.RunAsync<AppState>(args, runAsync: RunWorkflowAsync);

static async Task RunWorkflowAsync(JsonState<AppState> state, AgentJournal journal)
{
    // Workflow logic: Read state, invoke agents, and save the next state.
}
```

Then create some serializable state types and place a `state.json` beside `workflow.cs` with the initial state.

Finally, implement the workflow logic in `RunWorkflowAsync`: read from `state.Value`, invoke agents with `MyAgent.InvokeAndUpdateAsync(..., state, ...)`, and checkpoint non-agent state transitions with `state.UpdateAsync(...)`.


Compile and run it with:

```powershell
dotnet run workflow.cs
```

Use `--dry-run` to compile, load `state.json`, verify deserialization, and exit before workflow logic can invoke agents.

Once the dry run succeeds, run a rubber-duck subagent to verify the workflow design is minimal and sufficient for the user's goal before running agents that can make changes.

Use `--single-step` to run until the next successful `state.UpdateAsync(...)` checkpoint. Use `--show-agent-output` to show Copilot output:

```powershell
dotnet run .\.agent\<workflow-name>\workflow.cs -- --single-step
```

Note: Agent invocations run Copilot with `--yolo --no-ask-user` so workflows can proceed without interactive prompts.

Another useful option is `--show-agent-output`, which runs agents without `-s` so their output is printed to the console. This is helpful for debugging and for workflows where the user needs to see agent output to make decisions.

---

## Design Guidance

1. Keep `TState` explicit, serializable, and minimal: only information that should be passed from agent to agent at each workflow transition and to resume the workflow from an interruption.
2. Make the workflow method idempotent/resumable: it should be safe to restart from the top.
3. Before implementation, clarify ambiguous orchestration policy with the user, especially whether `failed`/`blocked` means stop the whole workflow on every resume, skip that item and continue, or wait for manual intervention.
4. Use `MyAgent.InvokeAndUpdateAsync(...)` for agent calls so each invocation is followed by a checkpoint. Use `state.UpdateAsync(...)` for simple state transitions that do not invoke an agent.
5. For value-returning agents, include a TypeScript-style JSON type for the output and optionally override `ValidateOutput` for custom validation. For void-returning agents (derived from `AgentAction<TAgent, TInput>`), the framework expects no output file.

---

## End-to-End Example: Minimal Empty Workflow

Use this as the smallest file-based app that compiles, loads `state.json`, and exits without invoking agents.

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

#pragma warning disable CA2007 // Consider calling ConfigureAwait on the awaited task

using AgentWorkflow;

return await WorkflowApp.RunAsync<EmptyState>(args, RunWorkflowAsync);

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

#pragma warning disable CA2007 // Consider calling ConfigureAwait on the awaited task

using AgentWorkflow;

return await WorkflowApp.RunAsync<ChecklistState>(args: args, runAsync: RunWorkflowAsync);

static async Task RunWorkflowAsync(JsonState<ChecklistState> state, AgentJournal journal)
{
    while (PickIssueNeedingWork(state.Value) is { } item)
    {
        if (item.Status == IssueStatus.Pending)
        {
            await TriageAgent.InvokeAndUpdateAsync(
                new TriageAgent.Input(item),
                journal,
                state,
                (current, triage) =>
                {
                    var nextStatus = triage.Decision switch
                    {
                        TriageDecision.NoRepro => IssueStatus.Done,
                        TriageDecision.ByDesign => IssueStatus.Done,
                        TriageDecision.NeedsFix => IssueStatus.NeedsFix,
                        TriageDecision.Blocked => IssueStatus.Blocked,
                        _ => throw new InvalidOperationException($"Unknown triage decision '{triage.Decision}'.")
                    };

                    return current.SetStatus(item.Id, nextStatus, triage);
                });
            continue;
        }

        if (item.Status == IssueStatus.NeedsFix)
        {
            var triage = item.LastTriage
                ?? throw new InvalidOperationException($"Item '{item.Id}' needs a fix but has no triage result.");

            await FixerAgent.InvokeAndUpdateAsync(
                new FixerAgent.Input(item, triage),
                journal,
                state,
                (current, fix) => current.SetStatus(item.Id, IssueStatus.Done, fix: fix));
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

public sealed record ChecklistState(IReadOnlyList<ChecklistItemState> Items);

public sealed record ChecklistItemState(
    string Id,
    string IssueId,
    string Title,
    string Status,
    TriageAgent.Output? LastTriage,
    FixerAgent.Output? LastFix);

public sealed class TriageAgent : AgentFunc<TriageAgent, TriageAgent.Input, TriageAgent.Output>
{
    public sealed record Input(ChecklistItemState Item);

    public sealed record Output(string Decision);

    public override string Prompt(Input input) => $$"""
        You are the Triage agent.

        Triage issue {{input.Item.IssueId}}: {{input.Item.Title}}.

        Return a decision of no_repro, by_design, needs_fix, or blocked.

        ## Triage guidance
        ...

        ## Output
        Write a JSON file matching this TypeScript type:

        type TriageOutput = {
          decision: "no_repro" | "by_design" | "needs_fix" | "blocked";
        };

        """; // note the framework appends instructions regarding the output file

    public override bool ValidateOutput(Output output)
    {
        return output.Decision is TriageDecision.NoRepro
            or TriageDecision.ByDesign
            or TriageDecision.NeedsFix
            or TriageDecision.Blocked;
    }
}

public sealed class FixerAgent : AgentFunc<FixerAgent, FixerAgent.Input, FixerAgent.Output>
{
    public sealed record Input(ChecklistItemState Item, TriageAgent.Output Triage);

    public sealed record Output(string Outcome, string? PullRequestUrl);

    public override string Prompt(Input input) => $$"""
        You are the Fixer agent.

        Fix issue {{input.Item.IssueId}}: {{input.Item.Title}}.
        Prior triage decision: {{input.Triage.Decision}}.

        Report either that a PR was opened or that the fix was abandoned.

        ## Fixing guidance
        ...

        ## Output
        Write a JSON file matching this TypeScript type:

        type FixerOutput = {
          outcome: "pr_opened" | "abandoned";
          pullRequestUrl: string | null;
        };

        """; // note the framework appends instructions regarding the output file

    public override bool ValidateOutput(Output output)
    {
        return output.Outcome is "pr_opened" or "abandoned";
    }
}

public static class ChecklistStateExtensions
{
    public static ChecklistState SetStatus(
        this ChecklistState state,
        string itemId,
        string status,
        TriageAgent.Output? triage = null,
        FixerAgent.Output? fix = null)
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
If adapting this to a checklist, ask the user whether a blocked/failed item is a hard stop for the whole workflow or only for that item. Encode that policy explicitly in the startup guard and item picker.

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

#pragma warning disable CA2007 // Consider calling ConfigureAwait on the awaited task

using AgentWorkflow;

const int MaxRounds = 3;

return await WorkflowApp.RunAsync<BuildReviewState>(args, RunWorkflowAsync);

static async Task RunWorkflowAsync(JsonState<BuildReviewState> state, AgentJournal journal)
{
    while (state.Value.Status is ReviewStatus.Pending or ReviewStatus.ChangesRequested or ReviewStatus.Evaluating)
    {
        if (state.Value.Status is ReviewStatus.Pending or ReviewStatus.ChangesRequested)
        {
            if (state.Value.Round >= MaxRounds)
            {
                await state.UpdateAsync(static current => current with { Status = ReviewStatus.Failed });
                return;
            }

            var nextRound = state.Value.Round + 1;
            await BuilderAgent.InvokeAndUpdateAsync(
                new BuilderAgent.Input(state.Value.Item, nextRound, state.Value.LastEvaluation),
                journal,
                state,
                (current, _) => current with
                {
                    Status = ReviewStatus.Evaluating,
                    Round = nextRound
                });
            continue;
        }

        await EvaluatorAgent.InvokeAndUpdateAsync(
            new EvaluatorAgent.Input(state.Value.Item, state.Value.Round),
            journal,
            state,
            (current, evaluation) =>
            {
                var nextStatus = evaluation.Decision switch
                {
                    EvaluationDecision.Accepted => ReviewStatus.Done,
                    EvaluationDecision.ChangesRequested => ReviewStatus.ChangesRequested,
                    EvaluationDecision.Blocked => ReviewStatus.Blocked,
                    _ => throw new InvalidOperationException($"Unknown evaluator decision '{evaluation.Decision}'.")
                };

                return current with
                {
                    Status = nextStatus,
                    LastEvaluation = evaluation
                };
            });

        if (state.Value.Status is ReviewStatus.Done or ReviewStatus.Blocked)
            return;
    }
}

public static class ReviewStatus
{
    public const string Pending = "pending";
    public const string Evaluating = "evaluating";
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
    EvaluatorAgent.Output? LastEvaluation);

public sealed record BuilderEvaluatorItemState(string Id, string Title);

public sealed class BuilderAgent : AgentAction<BuilderAgent, BuilderAgent.Input>
{
    public sealed record Input(BuilderEvaluatorItemState Item, int Round, EvaluatorAgent.Output? PreviousEvaluation);

    public override string Prompt(Input input) => $$"""
        You are the Builder.

        Implement item {{input.Item.Id}}: {{input.Item.Title}}.
        This is round {{input.Round}}.
        Address prior evaluator feedback if present.

        ## Evaluator feedback
        {{input.PreviousEvaluation?.Feedback}}

        ...
        """;
}

public sealed class EvaluatorAgent : AgentFunc<EvaluatorAgent, EvaluatorAgent.Input, EvaluatorAgent.Output>
{
    public sealed record Input(BuilderEvaluatorItemState Item, int Round);

    public sealed record Output(string Decision, string Feedback);

    public override string Prompt(Input input) => $$"""
        You are the Evaluator.

        Verify item {{input.Item.Id}}: {{input.Item.Title}}.
        This is round {{input.Round}}.
        Be skeptical of the Builder's work.

        Return a decision of accepted, changes_requested, or blocked.
        Do not edit implementation files.

        Write a JSON file matching this TypeScript type:

        type EvaluatorOutput = {
          decision: "accepted" | "changes_requested" | "blocked";
          feedback: string;
        };

        ...
        """; // note the framework appends instructions regarding the output file

    public override bool ValidateOutput(Output output)
    {
        return output.Decision is EvaluationDecision.Accepted
            or EvaluationDecision.ChangesRequested
            or EvaluationDecision.Blocked;
    }
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
--max-output-retries <n>    Retries for value-returning agent output. Default: 2.
--single-step               Exit after the next state checkpoint.
--show-agent-output         Do not pass -s to Copilot agent invocations.
```

### `JsonState<TState>`

```csharp
public sealed class JsonState<TState>
{
    public TState Value { get; }
    public Task UpdateAsync(Func<TState, TState> update);
}
```

`Value` is the loaded state. `UpdateAsync` computes the next state from the current state, writes `state.json` atomically, and updates `Value`.

### Strongly-typed Agents

```csharp
public abstract class AgentAction<TAgent, TInput>
{
    public string Name { get; }
    public abstract string Prompt(TInput input);
    public static Task<AgentInvocation> InvokeAndUpdateAsync<TState>(
        TInput input,
        AgentJournal journal,
        JsonState<TState> state,
        Func<TState, AgentInvocation, TState> update);
}
AgentInvocation invocation = await MyAgent.InvokeAndUpdateAsync(input, journal, state, update);

public abstract class AgentFunc<TAgent, TInput, TOutput> : AgentAction<TAgent, TInput>
{
    public static Task<TOutput> InvokeAndUpdateAsync<TState>(
        TInput input,
        AgentJournal journal,
        JsonState<TState> state,
        Func<TState, TOutput, TState> update);
    public virtual bool ValidateOutput(TOutput output);
}
MyOutput output = await MyAgent.InvokeAndUpdateAsync(input, journal, state, update);
```

`AgentAction<TAgent, TInput>` is void-returning. `AgentFunc<TAgent, TInput, TOutput>` is value-returning and requires `output.json` that deserializes to `TOutput` and passes `ValidateOutput`. The default `ValidateOutput` implementation returns `true`.

### `AgentJournal` and `AgentInvocation`

Pass the `AgentJournal` from `RunAsync` to each agent's `InvokeAndUpdateAsync` method. Each invocation folder records:

```text
input.json       serialized input object passed to the agent
prompt.md        prompt generated by the agent type
transcript.txt   Copilot transcript for the run
invocation.json  metadata: id, agent name, paths, status, timestamps
output.json      returned value, only for AgentFunc<TAgent, TInput, TOutput>
```

Void-returning agent calls return an `AgentInvocation` with paths, status, agent name, input/output type names, and timestamps.

### JSON behavior

Framework JSON uses `WorkflowJsonSerializer.Options`: indented output, camelCase property names, case-insensitive reads, and `JsonStringEnumConverter(JsonNamingPolicy.CamelCase)`.
