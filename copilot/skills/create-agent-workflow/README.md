# Agent Workflow Framework API

Reference `framework\AgentWorkflow.csproj` from a file-based workflow app:

```csharp
#:project <absolute path to this skill>\framework\AgentWorkflow.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true
```

## `WorkflowApp`

Entrypoint for workflow apps.

```csharp
public static Task<int> WorkflowApp.RunAsync<TState>(
    string[] args,
    Func<JsonState<TState>, AgentJournal, Task> runAsync,
    string workflowFilePath = "");
```

`RunAsync` derives paths from the folder containing `workflow.cs`, loads `state.json` as `TState`, creates an `AgentJournal`, then invokes `runAsync(state, journal)`.

Supported app options:

```text
--dry-run                   Load state, then exit without invoking agents.
--max-output-retries <n>    Retries for typed agent output. Default: 2.
--show-agent-output         Do not pass -s to Copilot agent invocations.
```

## `JsonState<TState>`

Wrapper around the deserialized `state.json`.

```csharp
public sealed class JsonState<TState>
{
    public TState Value { get; }
    public Task SaveAsync(TState newValue);
}
```

`SaveAsync` writes `state.json` atomically and updates `Value` to `newValue`.

## `Agent<TInput>`

Base type for action-only agents. These agents run a prompt and return an `AgentInvocation`; they do not require an `output.json`.

```csharp
public abstract class Agent<TInput>
{
    public string Name { get; }
    public abstract string Prompt(TInput input);
}
```

Invoke with:

```csharp
AgentInvocation invocation = await Agent.InvokeAsync<MyAgent, MyInput>(
    input,
    journal).ConfigureAwait(false);
```

## `Agent<TInput, TOutput>`

Base type for typed-output agents. These agents must write `output.json` that deserializes to `TOutput`.

```csharp
public abstract class Agent<TInput, TOutput> : Agent<TInput>
{
}
```

Invoke with:

```csharp
MyOutput output = await Agent.InvokeAsync<MyAgent, MyInput, MyOutput>(
    input,
    journal).ConfigureAwait(false);
```

## `AgentJournal`

Durable journal for agent invocations. Workflow apps receive it from `WorkflowApp.RunAsync` and pass it as the last argument to `Agent.InvokeAsync`.

Each invocation writes:

```text
input.json
prompt.md
transcript.txt
invocation.json
```

Typed-output invocations also write:

```text
output.json
```

## `AgentInvocation`

Returned by action-only agent invocations.

```csharp
public sealed record AgentInvocation(
    string Id,
    string AgentName,
    string InputType,
    string? OutputType,
    string Directory,
    string InputPath,
    string PromptPath,
    string? OutputPath,
    string TranscriptPath,
    AgentInvocationStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);
```

## JSON behavior

All framework JSON uses `WorkflowJsonSerializer.Options`:

```csharp
public static JsonSerializerOptions WorkflowJsonSerializer.Options { get; }
```

Behavior:

```text
WriteIndented = true
PropertyNamingPolicy = JsonNamingPolicy.CamelCase
PropertyNameCaseInsensitive = true
JsonStringEnumConverter(JsonNamingPolicy.CamelCase)
```
