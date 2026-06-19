namespace AgentWorkflow;

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

public enum AgentInvocationStatus
{
    Created,
    Running,
    Completed,
    Failed,
}
