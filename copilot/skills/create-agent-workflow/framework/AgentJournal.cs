using System.Text.Json;

namespace AgentWorkflow;

public sealed class AgentJournal
{
    private readonly AgentJournalOptions _options;

    public AgentJournal(AgentJournalOptions options)
    {
        _options = options;
        Directory.CreateDirectory(_options.WorkflowDirectory);
        Directory.CreateDirectory(InvocationsDirectory);
    }

    public JsonSerializerOptions JsonOptions => _options.JsonOptions;

    private string InvocationsDirectory => Path.Combine(_options.WorkflowDirectory, "invocations");

    internal Task<AgentInvocation> InvokeActionAsync<TAgent, TInput>(TInput input)
        where TAgent : AgentAction<TAgent, TInput>, new()
    {
        return InvokeActionAsync(new TAgent(), input);
    }

    internal Task<TOutput> InvokeAsync<TAgent, TInput, TOutput>(TInput input)
        where TAgent : AgentFunc<TAgent, TInput, TOutput>, new()
    {
        return InvokeAsync(new TAgent(), input);
    }

    private async Task<TOutput> InvokeAsync<TAgent, TInput, TOutput>(
        AgentFunc<TAgent, TInput, TOutput> agent,
        TInput input)
        where TAgent : AgentFunc<TAgent, TInput, TOutput>, new()
    {
        var prompt = agent.Prompt(input);
        var invocation = await CreateInvocationAsync(agent.Name, typeof(TInput), typeof(TOutput), input, prompt, hasOutput: true);
        var promptWithOutputContract = prompt + Environment.NewLine + Environment.NewLine + $"""
            Write the required JSON output file here:
            {invocation.OutputPath}

            The file must deserialize as {typeof(TOutput).FullName}.
            Your chat response is ignored for workflow state.
            """;

        await File.WriteAllTextAsync(invocation.PromptPath, promptWithOutputContract);

        var outputPath = invocation.OutputPath
            ?? throw new InvalidOperationException("Value-returning invocations must have an output path.");

        for (var retry = 0; retry <= _options.MaxOutputRetries; retry++)
        {
            if (File.Exists(outputPath))
            {
                File.Delete(outputPath);
            }

            await RunAgentProcessAsync(invocation, promptWithOutputContract);

            if (await TryReadOutputAsync<TOutput>(outputPath) is { } output &&
                agent.ValidateOutput(output))
            {
                await SaveInvocationAsync(invocation with { Status = AgentInvocationStatus.Completed, CompletedAt = DateTimeOffset.UtcNow });
                return output;
            }
        }

        await SaveInvocationAsync(invocation with { Status = AgentInvocationStatus.Failed, CompletedAt = DateTimeOffset.UtcNow });
        throw new InvalidOperationException($"{agent.Name} did not produce valid {typeof(TOutput).Name} JSON accepted by {nameof(AgentFunc<TAgent, TInput, TOutput>.ValidateOutput)} at '{outputPath}'.");
    }

    private async Task<AgentInvocation> InvokeActionAsync<TAgent, TInput>(
        AgentAction<TAgent, TInput> agent,
        TInput input)
        where TAgent : AgentAction<TAgent, TInput>, new()
    {
        var prompt = agent.Prompt(input);
        var invocation = await CreateInvocationAsync(agent.Name, typeof(TInput), outputType: null, input, prompt, hasOutput: false);
        await RunAgentProcessAsync(invocation, prompt);
        invocation = invocation with { Status = AgentInvocationStatus.Completed, CompletedAt = DateTimeOffset.UtcNow };
        await SaveInvocationAsync(invocation);
        return invocation;
    }

    private async Task<AgentInvocation> CreateInvocationAsync<TInput>(
        string agentName,
        Type inputType,
        Type? outputType,
        TInput input,
        string prompt,
        bool hasOutput)
    {
        var id = CreateInvocationId(agentName);
        var directory = Path.Combine(InvocationsDirectory, id);
        Directory.CreateDirectory(directory);

        var invocation = new AgentInvocation(
            Id: id,
            AgentName: agentName,
            InputType: inputType.FullName ?? inputType.Name,
            OutputType: outputType?.FullName,
            Directory: directory,
            InputPath: Path.Combine(directory, "input.json"),
            PromptPath: Path.Combine(directory, "prompt.md"),
            OutputPath: hasOutput ? Path.Combine(directory, "output.json") : null,
            TranscriptPath: Path.Combine(directory, "transcript.txt"),
            Status: AgentInvocationStatus.Created,
            CreatedAt: DateTimeOffset.UtcNow,
            CompletedAt: null);

        await using (var inputStream = File.Create(invocation.InputPath))
        {
            await JsonSerializer.SerializeAsync(inputStream, input, _options.JsonOptions);
        }

        await File.WriteAllTextAsync(invocation.PromptPath, prompt);
        await SaveInvocationAsync(invocation);
        return invocation;
    }

    private string CreateInvocationId(string agentName)
    {
        var safeName = SanitizeFileName(agentName);
        var next = Directory.EnumerateDirectories(InvocationsDirectory).Count() + 1;
        return $"{next:D6}-{safeName}";
    }

    private async Task RunAgentProcessAsync(
        AgentInvocation invocation,
        string prompt)
    {
        await SaveInvocationAsync(invocation with { Status = AgentInvocationStatus.Running });

        var executable = ResolveExecutableOnPath(_options.CopilotExecutable)
            ?? throw new FileNotFoundException($"Could not find '{_options.CopilotExecutable}' on PATH.");

        var startInfo = new System.Diagnostics.ProcessStartInfo
        {
            FileName = executable,
            WorkingDirectory = _options.WorkingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        startInfo.ArgumentList.Add("-p");
        startInfo.ArgumentList.Add(prompt);

        if (_options.Yolo)
        {
            startInfo.ArgumentList.Add("--yolo");
            startInfo.ArgumentList.Add("--no-ask-user");
        }

        if (_options.Silent)
        {
            startInfo.ArgumentList.Add("-s");
        }

        using var process = new System.Diagnostics.Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new IOException("Failed to start Copilot CLI.");
        }

        await using var transcript = new StreamWriter(invocation.TranscriptPath, append: true);
        var stdoutTask = PumpAsync(process.StandardOutput, Console.Out, transcript);
        var stderrTask = PumpAsync(process.StandardError, Console.Error, transcript);

        await Task.WhenAll(process.WaitForExitAsync(), stdoutTask, stderrTask);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{invocation.AgentName} exited with code {process.ExitCode}.");
        }
    }

    private async Task<TOutput?> TryReadOutputAsync<TOutput>(string? outputPath)
    {
        if (outputPath is null || !File.Exists(outputPath))
        {
            return default;
        }

        try
        {
            await using var stream = File.OpenRead(outputPath);
            return await JsonSerializer.DeserializeAsync<TOutput>(stream, _options.JsonOptions);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private Task SaveInvocationAsync(AgentInvocation invocation)
    {
        return AtomicJsonFile.WriteAsync(Path.Combine(invocation.Directory, "invocation.json"), invocation, _options.JsonOptions);
    }

    private static async Task PumpAsync(
        StreamReader reader,
        TextWriter console,
        StreamWriter transcript)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            await transcript.WriteLineAsync(line);
            await console.WriteLineAsync(line);
        }
    }

    private static string SanitizeFileName(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return new string(value.Select(ch => invalidChars.Contains(ch) ? '-' : char.ToLowerInvariant(ch)).ToArray());
    }

    private static string? ResolveExecutableOnPath(string tool)
    {
        var pathEntries = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT;.COM")
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : [string.Empty];

        foreach (var directory in pathEntries)
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                continue;
            }

            foreach (var extension in extensions)
            {
                var candidate = Path.Combine(directory, tool + extension);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            var plainCandidate = Path.Combine(directory, tool);
            if (File.Exists(plainCandidate))
            {
                return plainCandidate;
            }
        }

        return null;
    }
}
