using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

return await RalphApp.RunAsync(args);

static class RalphApp
{
    public static async Task<int> RunAsync(string[] args)
    {
        if (args.Any(arg => arg is "--help" or "-h" or "/?"))
        {
            PrintUsage();
            return 0;
        }

        var options = ParseArguments(args);
        if (options.Error is not null)
        {
            Console.Error.WriteLine($"Error: {options.Error}");
            Console.Error.WriteLine();
            PrintUsage();
            return 1;
        }

        var runnerDirectory = GetRunnerDirectory();
        var workingDirectory = Directory.GetCurrentDirectory();
        var prdFile = Path.Combine(workingDirectory, "prd.json");
        var progressFile = Path.Combine(workingDirectory, "progress.txt");
        var archiveDirectory = Path.Combine(workingDirectory, "archive");
        var lastBranchFile = Path.Combine(workingDirectory, ".last-branch");

        ArchivePreviousRunIfBranchChanged(prdFile, progressFile, archiveDirectory, lastBranchFile);
        TrackCurrentBranch(prdFile, lastBranchFile);
        EnsureProgressFile(progressFile);

        var promptFile = Path.Combine(runnerDirectory, "prompt.md");

        var executable = ResolveExecutableOnPath("copilot");
        var missingItems = new List<string>();
        if (executable is null)
        {
            missingItems.Add("Could not find 'copilot' on PATH");
        }

        if (!File.Exists(promptFile))
        {
            missingItems.Add($"Missing prompt file '{Path.GetFileName(promptFile)}' in {runnerDirectory}");
        }

        if (missingItems.Count > 0)
        {
            Console.Error.WriteLine("Error:");
            foreach (var item in missingItems)
            {
                Console.Error.WriteLine($"  - {item}");
            }
            return 1;
        }

        var resolvedExecutable = executable!;

        Console.WriteLine($"Starting Ralph - Tool: copilot - Max iterations: {options.MaxIterations}");
        Console.WriteLine($"Working directory: {workingDirectory}");

        for (var iteration = 1; iteration <= options.MaxIterations; iteration++)
        {
            Console.WriteLine();
            Console.WriteLine("===============================================================");
            Console.WriteLine($"  Ralph Iteration {iteration} of {options.MaxIterations} (copilot)");
            Console.WriteLine("===============================================================");

            string output;
            try
            {
                output = await RunToolAsync(resolvedExecutable, promptFile, workingDirectory);
            }
            catch (Exception ex) when (ex is Win32Exception or IOException)
            {
                Console.Error.WriteLine($"Tool launch failed: {ex.Message}");
                return 1;
            }

            if (output.Contains("<promise>COMPLETE</promise>", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine();
                Console.WriteLine("Ralph completed all tasks!");
                Console.WriteLine($"Completed at iteration {iteration} of {options.MaxIterations}");
                return 0;
            }

            Console.WriteLine($"Iteration {iteration} complete. Continuing...");

            if (iteration < options.MaxIterations)
            {
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }

        Console.WriteLine();
        Console.WriteLine($"Ralph reached max iterations ({options.MaxIterations}) without completing all tasks.");
        Console.WriteLine($"Check {progressFile} for status.");
        return 1;
    }

    private static Options ParseArguments(string[] args)
    {
        var maxIterations = 10;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];

            if (int.TryParse(arg, out var parsedIterations) && parsedIterations > 0)
            {
                maxIterations = parsedIterations;
                continue;
            }

            return new Options(0, $"Unrecognized argument '{arg}'.");
        }

        return new Options(maxIterations, null);
    }

    private static void PrintUsage()
    {
        Console.WriteLine("Usage:");
        Console.WriteLine(@"  dotnet run .\copilot\ralph\ralph.cs");
        Console.WriteLine(@"  dotnet run .\copilot\ralph\ralph.cs -- [max_iterations]");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine(@"  dotnet run .\copilot\ralph\ralph.cs");
        Console.WriteLine(@"  dotnet run .\copilot\ralph\ralph.cs -- 10");
        Console.WriteLine(@"  dotnet run .\copilot\ralph\ralph.cs -- 20");
    }

    private static void ArchivePreviousRunIfBranchChanged(
        string prdFile,
        string progressFile,
        string archiveDirectory,
        string lastBranchFile)
    {
        if (!File.Exists(prdFile) || !File.Exists(lastBranchFile))
        {
            return;
        }

        var currentBranch = ReadBranchName(prdFile);
        var lastBranch = SafeReadText(lastBranchFile);

        if (string.IsNullOrWhiteSpace(currentBranch) ||
            string.IsNullOrWhiteSpace(lastBranch) ||
            string.Equals(currentBranch, lastBranch, StringComparison.Ordinal))
        {
            return;
        }

        var date = DateTime.Now.ToString("yyyy-MM-dd");
        var folderName = SanitizeFileName(lastBranch.Replace("ralph/", "", StringComparison.Ordinal));
        var archiveFolder = Path.Combine(archiveDirectory, $"{date}-{folderName}");

        Console.WriteLine($"Archiving previous run: {lastBranch}");
        Directory.CreateDirectory(archiveFolder);

        File.Copy(prdFile, Path.Combine(archiveFolder, Path.GetFileName(prdFile)), overwrite: true);
        if (File.Exists(progressFile))
        {
            File.Copy(progressFile, Path.Combine(archiveFolder, Path.GetFileName(progressFile)), overwrite: true);
        }

        Console.WriteLine($"  Archived to: {archiveFolder}");
        ResetProgressFile(progressFile);
    }

    private static void TrackCurrentBranch(string prdFile, string lastBranchFile)
    {
        if (!File.Exists(prdFile))
        {
            return;
        }

        var currentBranch = ReadBranchName(prdFile);
        if (!string.IsNullOrWhiteSpace(currentBranch))
        {
            File.WriteAllText(lastBranchFile, currentBranch + Environment.NewLine);
        }
    }

    private static void EnsureProgressFile(string progressFile)
    {
        if (!File.Exists(progressFile))
        {
            ResetProgressFile(progressFile);
        }
    }

    private static void ResetProgressFile(string progressFile)
    {
        var contents = new StringBuilder()
            .AppendLine("# Ralph Progress Log")
            .AppendLine($"Started: {DateTime.Now:yyyy-MM-dd HH:mm:ss}")
            .AppendLine("---")
            .ToString();

        File.WriteAllText(progressFile, contents);
    }

    private static string? ReadBranchName(string prdFile)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(prdFile));
            if (document.RootElement.TryGetProperty("branchName", out var branchNameElement))
            {
                return branchNameElement.GetString()?.Trim();
            }
        }
        catch (JsonException)
        {
            Console.Error.WriteLine($"Warning: Could not parse JSON in {prdFile}.");
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine($"Warning: Could not read {prdFile}: {ex.Message}");
        }

        return null;
    }

    private static async Task<string> RunToolAsync(
        string executable,
        string promptFile,
        string workingDirectory)
    {
        var promptText = await File.ReadAllTextAsync(promptFile);
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        startInfo.ArgumentList.Add("-p");
        startInfo.ArgumentList.Add(promptText);
        startInfo.ArgumentList.Add("--yolo");
        startInfo.ArgumentList.Add("--no-ask-user");
        startInfo.ArgumentList.Add("-s");

        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new IOException("Failed to start 'copilot'.");
        }

        var output = new StringBuilder();
        var stdoutTask = PumpAsync(process.StandardOutput, Console.Out, output);
        var stderrTask = PumpAsync(process.StandardError, Console.Error, output);

        await Task.WhenAll(process.WaitForExitAsync(), stdoutTask, stderrTask);

        if (process.ExitCode != 0)
        {
            Console.Error.WriteLine($"Tool exited with code {process.ExitCode}.");
        }

        return output.ToString();
    }

    private static string GetRunnerDirectory([CallerFilePath] string? sourcePath = null)
    {
        return Path.GetDirectoryName(sourcePath) ?? Directory.GetCurrentDirectory();
    }

    private static async Task PumpAsync(StreamReader reader, TextWriter writer, StringBuilder sink)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            sink.AppendLine(line);
            await writer.WriteLineAsync(line);
        }
    }

    private static string? ResolveExecutableOnPath(string tool)
    {
        var pathEntries = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT;.COM")
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : new[] { string.Empty };

        foreach (var directory in pathEntries)
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                continue;
            }

            foreach (var extension in extensions)
            {
                var candidate = Path.Combine(directory, tool + extension.ToLowerInvariant());
                if (File.Exists(candidate))
                {
                    return candidate;
                }

                candidate = Path.Combine(directory, tool + extension.ToUpperInvariant());
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

    private static string SafeReadText(string path)
    {
        try
        {
            return File.ReadAllText(path).Trim();
        }
        catch (IOException)
        {
            return string.Empty;
        }
    }

    private static string SanitizeFileName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(name.Select(ch => invalidChars.Contains(ch) ? '-' : ch).ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? "unknown-branch" : sanitized;
    }

    private sealed record Options(int MaxIterations, string? Error);
}
