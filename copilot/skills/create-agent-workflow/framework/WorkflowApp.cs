using System.Runtime.CompilerServices;

namespace AgentWorkflow;

public static class WorkflowApp
{
    public static async Task<int> RunAsync<TState>(
        string[] args,
        Func<JsonState<TState>, AgentJournal, Task> runAsync,
        [CallerFilePath] string workflowFilePath = "")
    {
        if (!TryCreateOptions(args, workflowFilePath, out var options, out var exitCode))
        {
            return exitCode;
        }

        var state = await JsonState<TState>.LoadAsync(options.StatePath);
        return await RunAsync(options, state, runAsync);
    }

    private static bool TryCreateOptions(
        string[] args,
        string workflowFilePath,
        out WorkflowAppOptions options,
        out int exitCode)
    {
        if (args.Any(arg => arg is "--help" or "-h" or "/?"))
        {
            PrintUsage();
            options = WorkflowAppOptions.Empty;
            exitCode = 0;
            return false;
        }

        options = WorkflowAppOptions.Parse(args, workflowFilePath);
        if (options.Error is not null)
        {
            Console.Error.WriteLine($"Error: {options.Error}");
            Console.Error.WriteLine();
            PrintUsage();
            exitCode = 1;
            return false;
        }

        exitCode = 0;
        return true;
    }

    private static async Task<int> RunAsync<TState>(
        WorkflowAppOptions options,
        JsonState<TState> state,
        Func<JsonState<TState>, AgentJournal, Task> runAsync)
    {
        if (options.DryRun)
        {
            Console.WriteLine($"Loaded state from '{options.StatePath}'.");
            return 0;
        }

        var journal = new AgentJournal(new AgentJournalOptions
        {
            WorkflowDirectory = options.WorkflowDirectory,
            WorkingDirectory = Directory.GetCurrentDirectory(),
            MaxOutputRetries = options.MaxOutputRetries,
            Silent = options.Silent,
        });

        await runAsync(state, journal);
        return 0;
    }

    private static void PrintUsage()
    {
        Console.WriteLine("Usage:");
        Console.WriteLine("  dotnet run <workflow.cs> -- [options]");
        Console.WriteLine();
        Console.WriteLine("Options:");
        Console.WriteLine("  --dry-run                   Load state, then exit without invoking agents.");
        Console.WriteLine("  --max-output-retries <n>    Retries for typed agent output. Default: 2");
        Console.WriteLine("  --show-agent-output         Do not pass -s to Copilot agent invocations.");
    }
}

internal sealed record WorkflowAppOptions(
    string StatePath,
    string WorkflowDirectory,
    int MaxOutputRetries,
    bool Silent,
    bool DryRun,
    string? Error)
{
    public static WorkflowAppOptions Parse(string[] args, string workflowFilePath)
    {
        var workflowDirectory = GetDefaultWorkflowDirectory(workflowFilePath);
        var statePath = Path.Combine(workflowDirectory, "state.json");
        var maxOutputRetries = 2;
        var silent = true;
        var dryRun = false;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            switch (arg)
            {
                case "--max-output-retries":
                    if (!TryReadValue(args, ref i, out var value) || !int.TryParse(value, out maxOutputRetries) || maxOutputRetries < 0)
                    {
                        return Error("Expected a non-negative integer for --max-output-retries.");
                    }

                    break;

                case "--dry-run":
                    dryRun = true;
                    break;

                case "--show-agent-output":
                    silent = false;
                    break;

                default:
                    return Error($"Unrecognized argument '{arg}'.");
            }
        }

        return new WorkflowAppOptions(statePath, workflowDirectory, maxOutputRetries, silent, dryRun, Error: null);

        static WorkflowAppOptions Error(string message)
            => new(string.Empty, string.Empty, 0, true, false, message);
    }

    public static WorkflowAppOptions Empty { get; } = new(string.Empty, string.Empty, 0, true, false, Error: null);

    private static string GetDefaultWorkflowDirectory(string workflowFilePath)
    {
        if (!string.IsNullOrWhiteSpace(workflowFilePath))
        {
            var directory = Path.GetDirectoryName(Path.GetFullPath(workflowFilePath));
            if (!string.IsNullOrEmpty(directory))
            {
                return directory;
            }
        }

        return Path.Combine(Directory.GetCurrentDirectory(), ".agent", "workflow");
    }

    private static bool TryReadValue(string[] args, ref int index, out string value)
    {
        if (index + 1 >= args.Length)
        {
            value = string.Empty;
            return false;
        }

        value = args[++index];
        return true;
    }
}
