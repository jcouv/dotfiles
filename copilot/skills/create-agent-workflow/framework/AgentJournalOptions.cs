using System.Text.Json;

namespace AgentWorkflow;

public sealed class AgentJournalOptions
{
    public string WorkflowDirectory { get; init; } = Path.Combine(Directory.GetCurrentDirectory(), ".agent", "workflow");

    public string WorkingDirectory { get; init; } = Directory.GetCurrentDirectory();

    public string CopilotExecutable { get; init; } = "copilot";

    public int MaxOutputRetries { get; init; } = 2;

    public bool Yolo { get; init; } = true;

    public bool Silent { get; init; } = true;

    public JsonSerializerOptions JsonOptions { get; init; } = WorkflowJsonSerializer.Options;
}
