// walkthrough.cs — scaffold and auto-populate a PR review walkthrough.
// Usage: dotnet run walkthrough.cs -- <github-pr-url>
//        dotnet run walkthrough.cs -- --compare <base>...<head>

#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

return await RunAsync(args);

// ──────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────

static async Task<int> RunAsync(string[] args)
{
    if (args.Length == 0 || args.Any(a => a is "--help" or "-h"))
    {
        PrintUsage();
        return 0;
    }

    try
    {
        var scaffoldOnly = args.Contains("--scaffold-only", StringComparer.OrdinalIgnoreCase);
        var openAfterWrite = args.Contains("--open", StringComparer.OrdinalIgnoreCase);
        var filtered = args
            .Where(a => !a.Equals("--scaffold-only", StringComparison.OrdinalIgnoreCase)
                     && !a.Equals("--open", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        // Strip optional leading "init" verb.
        if (filtered.Length > 0 && filtered[0].Equals("init", StringComparison.OrdinalIgnoreCase))
            filtered = filtered[1..];

        var request = WalkthroughRequest.Parse(filtered);
        var outputPath = ReviewFileResolver.ResolvePath(request);

        var metadata = await MetadataLoader.TryLoadAsync(request);
        File.WriteAllText(outputPath, MarkdownRenderer.Render(request, metadata));

        Console.WriteLine($"Initialized walkthrough file: {outputPath}");
        Console.WriteLine("Re-run init with the same input to intentionally overwrite the canonical scaffold.");

        if (!scaffoldOnly)
        {
            Console.WriteLine("Invoking Copilot to inspect the change and complete the walkthrough...");
            var result = await CopilotReviewOrchestrator.TryCompleteAsync(request, outputPath);
            var completed = await WaitForCompletionAsync(outputPath);

            if (!result.Success)
            {
                if (completed)
                {
                    Console.WriteLine("Copilot finished populating the walkthrough before the subprocess exited cleanly.");
                    WriteProcessFailure(result);
                }
                else
                {
                    Console.Error.WriteLine("Copilot could not complete the walkthrough automatically.");
                    WriteProcessFailure(result);
                    Console.Error.WriteLine($"The scaffold is still available at: {outputPath}");
                    Console.Error.WriteLine($"To continue manually, run: dotnet run scribe.cs -- prompt --file \"{outputPath}\"");
                    return 1;
                }
            }

            if (!completed)
            {
                Console.Error.WriteLine("Copilot finished, but the walkthrough still contains the starter placeholder. The review file is not complete yet.");
                if (!string.IsNullOrWhiteSpace(result.StdOut))
                    Console.Error.WriteLine(result.StdOut.Trim());
                Console.Error.WriteLine($"To continue manually, run: dotnet run scribe.cs -- prompt --file \"{outputPath}\"");
                return 1;
            }

            Console.WriteLine("Copilot populated the walkthrough.");
        }

        if (openAfterWrite)
            TryOpen(outputPath);

        return 0;
    }
    catch (UserInputException ex)
    {
        Console.Error.WriteLine($"Error: {ex.Message}");
        Console.Error.WriteLine();
        PrintUsage();
        return 1;
    }
}

static void PrintUsage()
{
    Console.WriteLine("""
        Start or refresh a private PR review walkthrough from a URL or local compare target.

        Usage:
          dotnet run walkthrough.cs -- <github-pr-url>
          dotnet run walkthrough.cs -- --compare <base>...<head>
          dotnet run walkthrough.cs -- --base <base> --head <head>
          dotnet run walkthrough.cs -- <github-pr-url> --open
          dotnet run walkthrough.cs -- <github-pr-url> --scaffold-only

        Notes:
        - Re-running with the same input overwrites the canonical pr-review-*.md file.
        - Use --scaffold-only to stop after the scaffold and drive the note-taking phase manually.
        - After the scaffold exists, use `dotnet run scribe.cs -- prompt` for the reusable agent prompt.
        """);
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

static async Task<bool> WaitForCompletionAsync(string outputPath)
{
    for (var attempt = 0; attempt < 5; attempt++)
    {
        if (IsWalkthroughComplete(outputPath)) return true;
        await Task.Delay(TimeSpan.FromSeconds(2));
    }
    return IsWalkthroughComplete(outputPath);
}

static bool IsWalkthroughComplete(string path)
{
    if (!File.Exists(path)) return false;
    var content = File.ReadAllText(path);
    var starterRemoved = !content.Contains("<!-- walkthrough-starter -->", StringComparison.Ordinal);
    var hasContent = content.Contains("## Walkthrough", StringComparison.Ordinal)
        && (content.Contains("### Step ", StringComparison.Ordinal)
            || content.Contains("### Grounded hunk -", StringComparison.Ordinal)
            || content.Contains("<!-- review-helper-entry:", StringComparison.Ordinal));
    return starterRemoved && hasContent;
}

static void TryOpen(string path)
{
    try { Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true }); }
    catch (Exception ex) { Console.WriteLine($"Generated the file, but opening it failed: {ex.Message}"); }
}

static void WriteProcessFailure(ProcessResult result)
{
    var detail = !string.IsNullOrWhiteSpace(result.StdErr) ? result.StdErr.Trim() : result.StdOut.Trim();
    if (!string.IsNullOrWhiteSpace(detail))
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine(detail);
    }
}

// ──────────────────────────────────────────────────────────────────
// WalkthroughRequest — PR URL or local compare input
// ──────────────────────────────────────────────────────────────────

enum ReviewSourceMode { PullRequestUrl, LocalCompare }

sealed record WalkthroughRequest(
    ReviewSourceMode Mode,
    string SourceLabel,
    string CanonicalKey,
    string CanonicalFileName,
    string? PullRequestUrl,
    string? Owner,
    string? Repo,
    int? PullNumber,
    string? BaseBranch,
    string? HeadBranch)
{
    public static WalkthroughRequest Parse(string[] args)
    {
        if (args.Length == 1 && TryParsePullRequestUrl(args[0], out var parsed))
            return parsed;

        var compare = GetOpt(args, "--compare");
        if (!string.IsNullOrWhiteSpace(compare))
        {
            var parts = compare.Split(["..."], StringSplitOptions.TrimEntries);
            if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
                throw new UserInputException("Use --compare in the form <base>...<head>.");
            return FromCompare(parts[0], parts[1]);
        }

        var baseBranch = GetOpt(args, "--base");
        var headBranch = GetOpt(args, "--head");
        if (!string.IsNullOrWhiteSpace(baseBranch) || !string.IsNullOrWhiteSpace(headBranch))
        {
            if (string.IsNullOrWhiteSpace(baseBranch) || string.IsNullOrWhiteSpace(headBranch))
                throw new UserInputException("Provide both --base <branch> and --head <branch>.");
            return FromCompare(baseBranch, headBranch);
        }

        if (args.Length == 1 && Uri.TryCreate(args[0], UriKind.Absolute, out _))
            throw new UserInputException("Only GitHub pull request URLs are supported. Use a URL like https://github.com/owner/repo/pull/123.");

        throw new UserInputException("I couldn't determine the review source. Pass a GitHub PR URL or a local compare target.");
    }

    private static WalkthroughRequest FromCompare(string baseBranch, string headBranch)
    {
        var key = $"compare-{Sanitize(baseBranch)}-vs-{Sanitize(headBranch)}";
        return new(ReviewSourceMode.LocalCompare, $"{baseBranch}...{headBranch}", key, $"pr-review-{key}.md",
            null, null, null, null, baseBranch, headBranch);
    }

    private static bool TryParsePullRequestUrl(string input, out WalkthroughRequest request)
    {
        request = null!;
        if (!Uri.TryCreate(input, UriKind.Absolute, out var uri)) return false;
        if (uri.Host.ToLowerInvariant() is not ("github.com" or "www.github.com")) return false;
        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length < 4 || !segments[2].Equals("pull", StringComparison.OrdinalIgnoreCase)) return false;
        if (!int.TryParse(segments[3], out var pullNumber)) return false;

        var owner = segments[0];
        var repo = segments[1];
        var key = $"{Sanitize(owner)}-{Sanitize(repo)}-pr-{pullNumber}";
        request = new(ReviewSourceMode.PullRequestUrl, $"{owner}/{repo}#{pullNumber}", key, $"pr-review-{key}.md",
            input, owner, repo, pullNumber, null, null);
        return true;
    }

    internal static string? GetOpt(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
            if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        return null;
    }

    internal static string Sanitize(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var ch in value.ToLowerInvariant())
            sb.Append(char.IsLetterOrDigit(ch) ? ch : '-');
        return sb.ToString().Trim('-');
    }
}

// ──────────────────────────────────────────────────────────────────
// ReviewFileResolver
// ──────────────────────────────────────────────────────────────────

static class ReviewFileResolver
{
    public static string ResolvePath(WalkthroughRequest request, string? explicitPath = null)
    {
        var cwd = Directory.GetCurrentDirectory();
        if (!string.IsNullOrWhiteSpace(explicitPath))
            return Path.IsPathRooted(explicitPath) ? explicitPath : Path.GetFullPath(Path.Combine(cwd, explicitPath));
        return Path.Combine(cwd, request.CanonicalFileName);
    }
}

// ──────────────────────────────────────────────────────────────────
// MetadataLoader
// ──────────────────────────────────────────────────────────────────

sealed record ReviewMetadata(
    string? Title,
    IReadOnlyList<string> ChangedFiles,
    string? BaseBranch,
    string? HeadBranch,
    string? RetrievalNote);

static class MetadataLoader
{
    public static async Task<ReviewMetadata> TryLoadAsync(WalkthroughRequest request) =>
        request.Mode switch
        {
            ReviewSourceMode.PullRequestUrl => await TryLoadFromGitHubAsync(request),
            ReviewSourceMode.LocalCompare => await LoadFromLocalCompareAsync(request),
            _ => new(null, [], null, null, null)
        };

    private static async Task<ReviewMetadata> TryLoadFromGitHubAsync(WalkthroughRequest request)
    {
        var ghExists = await ProcessRunner.TryRunAsync("gh", "--version");
        if (!ghExists.Success)
            return new(null, [], null, null, "GitHub CLI was not available, so only the PR identity was captured from the URL.");

        var jsonResult = await ProcessRunner.TryRunAsync("gh", "pr", "view", request.PullRequestUrl!, "--json", "title,baseRefName,headRefName");
        string? title = null, baseBranch = null, headBranch = null;
        string? retrievalNote = null;

        if (jsonResult.Success)
        {
            using var doc = JsonDocument.Parse(jsonResult.StdOut);
            var root = doc.RootElement;
            title = TryGetString(root, "title");
            baseBranch = TryGetString(root, "baseRefName");
            headBranch = TryGetString(root, "headRefName");
        }
        else
        {
            retrievalNote = "The PR URL was accepted, but GitHub metadata could not be loaded automatically.";
        }

        var fileResult = await ProcessRunner.TryRunAsync("gh", "pr", "diff", request.PullRequestUrl!, "--name-only");
        var changedFiles = fileResult.Success
            ? fileResult.StdOut.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(20).ToArray()
            : Array.Empty<string>();

        return new(title, changedFiles, baseBranch, headBranch, retrievalNote);
    }

    private static async Task<ReviewMetadata> LoadFromLocalCompareAsync(WalkthroughRequest request)
    {
        var repoCheck = await ProcessRunner.TryRunAsync("git", "rev-parse", "--is-inside-work-tree");
        if (!repoCheck.Success || !repoCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
            throw new UserInputException("The local compare fallback must be run inside a git repository.");

        var range = $"{request.BaseBranch}...{request.HeadBranch}";
        var diffResult = await ProcessRunner.TryRunAsync("git", "diff", "--name-only", range);
        if (!diffResult.Success)
            throw new UserInputException($"Couldn't compare {range}. Make sure both refs exist locally.");

        var changedFiles = diffResult.StdOut.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(20).ToArray();
        return new(null, changedFiles, request.BaseBranch, request.HeadBranch, "Initialized from a local branch comparison.");
    }

    private static string? TryGetString(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}

// ──────────────────────────────────────────────────────────────────
// MarkdownRenderer — builds the initial scaffold
// ──────────────────────────────────────────────────────────────────

static class MarkdownRenderer
{
    public static string Render(WalkthroughRequest request, ReviewMetadata metadata)
    {
        var generatedAt = DateTimeOffset.UtcNow.ToString("u");
        var focusFiles = BriefComposer.GetFocusFiles(metadata.ChangedFiles);
        var supportingGroups = BriefComposer.GetSupportingGroups(metadata.ChangedFiles);
        var supportingCount = supportingGroups.Sum(g => g.Files.Count);
        var sb = new StringBuilder();

        sb.AppendLine("# PR Review Walkthrough");
        sb.AppendLine();
        sb.AppendLine($"> Canonical review aid for `{request.CanonicalKey}`. Re-running this workflow overwrites the same file.");
        sb.AppendLine();
        sb.AppendLine("## Review Source");
        sb.AppendLine();
        sb.AppendLine("| Field | Value |");
        sb.AppendLine("| --- | --- |");
        sb.AppendLine($"| Mode | {(request.Mode == ReviewSourceMode.PullRequestUrl ? "GitHub pull request URL" : "Local branch comparison")} |");
        sb.AppendLine($"| Input | {Esc(request.PullRequestUrl ?? $"{request.BaseBranch}...{request.HeadBranch}")} |");
        sb.AppendLine($"| Generated (UTC) | {generatedAt} |");

        if (!string.IsNullOrWhiteSpace(metadata.BaseBranch) || !string.IsNullOrWhiteSpace(metadata.HeadBranch))
            sb.AppendLine($"| Base / Head | {Esc($"{metadata.BaseBranch ?? request.BaseBranch} -> {metadata.HeadBranch ?? request.HeadBranch}")} |");

        sb.AppendLine();
        sb.AppendLine("## Reviewer Brief");
        sb.AppendLine();
        foreach (var line in BriefComposer.Build(request, metadata))
            sb.AppendLine(line);
        sb.AppendLine();
        sb.AppendLine("## Areas to Inspect First");
        sb.AppendLine();

        if (focusFiles.Count > 0)
        {
            foreach (var f in focusFiles.Take(6)) sb.AppendLine($"- `{f}`");
            var hidden = focusFiles.Count - Math.Min(focusFiles.Count, 6);
            if (hidden > 0) sb.AppendLine($"- _{hidden} more higher-signal path(s) omitted._");
            if (supportingCount > 0) sb.AppendLine($"- _{supportingCount} lower-signal path(s) were grouped under `## Supporting Notes`._");
        }
        else
        {
            sb.AppendLine("- _No file list was auto-discovered. Inspect the PR diff or rerun with `gh` access._");
        }

        sb.AppendLine();
        sb.AppendLine("## Walkthrough");
        sb.AppendLine();
        foreach (var line in NarrativeComposer.Build(request, metadata))
            sb.AppendLine(line);
        sb.AppendLine();
        sb.AppendLine("## Supporting Notes");
        sb.AppendLine();

        if (supportingGroups.Count > 0)
        {
            sb.AppendLine("### Supporting changes grouped by default");
            sb.AppendLine();
            foreach (var group in supportingGroups)
            {
                var preview = group.Files.Take(4).Select(f => $"`{f}`").ToArray();
                var suffix = group.Files.Count > preview.Length ? $", and {group.Files.Count - preview.Length} more" : "";
                sb.AppendLine($"- **{group.Label}:** {string.Join(", ", preview)}{suffix}");
            }
            sb.AppendLine();
            sb.AppendLine("_Keep this section terse unless one of these supporting files turns out to be central to the reviewer story._");
        }
        else
        {
            sb.AppendLine("_Use this section for low-signal or follow-up details._");
        }

        if (!string.IsNullOrWhiteSpace(metadata.RetrievalNote))
        {
            sb.AppendLine();
            sb.AppendLine("## Retrieval Notes");
            sb.AppendLine();
            sb.AppendLine($"- {metadata.RetrievalNote}");
        }

        return sb.ToString();
    }

    private static string Esc(string v) => v.Replace("|", "\\|", StringComparison.Ordinal);
}

// ──────────────────────────────────────────────────────────────────
// BriefComposer — reviewer brief bullets + file classification
// ──────────────────────────────────────────────────────────────────

sealed record SupportingChangeGroup(string Label, IReadOnlyList<string> Files);

static class BriefComposer
{
    public static IReadOnlyList<string> Build(WalkthroughRequest request, ReviewMetadata metadata)
    {
        var coreFiles = GetLikelyCoreFiles(metadata.ChangedFiles);
        var focusFiles = GetFocusFiles(metadata.ChangedFiles).Take(3).ToArray();
        var supportingCount = GetSupportingGroups(metadata.ChangedFiles).Sum(g => g.Files.Count);
        var lines = new List<string>();

        if (!string.IsNullOrWhiteSpace(metadata.Title))
            lines.Add($"- **PR title:** {metadata.Title.Trim()}");

        var changed = DescribeChanged(metadata.ChangedFiles.Count, coreFiles.Count, supportingCount);
        lines.Add(!string.IsNullOrWhiteSpace(metadata.Title)
            ? $"- **What changed:** The change is framed as _{metadata.Title.Trim()}_ and currently spans {changed}."
            : $"- **What changed:** This review currently spans {changed}.");

        lines.Add(focusFiles.Length > 0
            ? $"- **Why it matters:** The changed paths suggest the semantic core likely lives in {JoinSentence(focusFiles.Select(f => $"`{f}`"))}, so starting there should orient the review quickly."
            : "- **Why it matters:** Only the review source was available at initialization time.");

        var focusList = focusFiles.Length > 0
            ? string.Join(", ", focusFiles.Select(f => $"`{f}`"))
            : "Inspect the raw diff to determine the highest-signal files.";
        if (supportingCount > 0)
            focusList += " (Lower-signal churn is grouped under `## Supporting Notes`.)";
        lines.Add($"- **Focus first on:** {focusList}");

        lines.Add(!string.IsNullOrWhiteSpace(metadata.Title) || metadata.ChangedFiles.Count > 0
            ? "- **Confidence note:** This opening brief is intentionally conservative and based on discovered metadata plus changed paths; refine it after inspecting the full diff."
            : "- **Confidence note:** Intent is still inferred from the review source alone because file-level metadata was unavailable.");

        return lines;
    }

    public static IReadOnlyList<string> GetFocusFiles(IReadOnlyList<string> files)
    {
        var prioritized = GetPrioritized(files);
        var core = GetLikelyCoreFiles(files);
        return core.Count > 0 ? core : prioritized;
    }

    public static IReadOnlyList<string> GetLikelyCoreFiles(IReadOnlyList<string> files) =>
        GetPrioritized(files).Where(p => GetSupportingGroup(p) is null).ToArray();

    public static IReadOnlyList<SupportingChangeGroup> GetSupportingGroups(IReadOnlyList<string> files) =>
        files.Select(p => (Path: p, Group: GetSupportingGroup(p)))
            .Where(x => x.Group is not null)
            .GroupBy(x => x.Group!, StringComparer.Ordinal)
            .OrderBy(g => g.Key switch { "Tests and validation" => 0, "Localization and content" => 1, "Generated or build artifacts" => 2, "Workflow scaffolding" => 3, _ => 4 })
            .Select(g => new SupportingChangeGroup(g.Key, g.Select(x => x.Path).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray()))
            .ToArray();

    private static IReadOnlyList<string> GetPrioritized(IReadOnlyList<string> files) =>
        files.OrderBy(GetPriority).ThenBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray();

    private static int GetPriority(string path)
    {
        var n = path.Replace('\\', '/').ToLowerInvariant();
        if (n is "progress.txt" or "prd.json" or "ralph/prd.json" or ".gitignore") return 4;
        if (n.EndsWith(".cs") || n.EndsWith(".ts") || n.EndsWith(".tsx") || n.EndsWith(".js") || n.EndsWith(".jsx") || n.EndsWith(".py") || n.EndsWith(".go") || n.EndsWith(".java")) return 0;
        if (n.Contains("prompt") || n.EndsWith(".md")) return 1;
        if (n.EndsWith(".json") || n.EndsWith(".txt")) return 3;
        return 2;
    }

    private static string? GetSupportingGroup(string path)
    {
        var n = path.Replace('\\', '/').ToLowerInvariant();
        var segs = n.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (segs.Any(s => s is "test" or "tests" or "__tests__" or "__snapshots__") || n.Contains(".test.") || n.Contains(".spec.") || n.EndsWith(".snap")) return "Tests and validation";
        if (segs.Any(s => s is "locale" or "locales" or "i18n" or "l10n" or "translations") || n.EndsWith(".resx") || n.Contains("messages.")) return "Localization and content";
        if (n.EndsWith(".g.cs") || n.EndsWith(".designer.cs") || n.Contains(".generated.") || n.EndsWith(".min.js") || n.EndsWith(".map") || n is "package-lock.json" or "yarn.lock" or "pnpm-lock.yaml" or "composer.lock" || segs.Any(s => s is "dist" or "coverage" or "generated")) return "Generated or build artifacts";
        if (n is "progress.txt" or "prd.json" or "ralph/prd.json" or ".gitignore" || n.StartsWith("tasks/")) return "Workflow scaffolding";
        return null;
    }

    private static string DescribeChanged(int count, int focus, int supporting)
    {
        var s = count switch { <= 0 => "the initial review scaffold only", 1 => "1 changed file", _ => $"{count} changed files" };
        if (count > 0 && supporting > 0 && focus > 0) s += $" ({focus} likely core and {supporting} supporting)";
        else if (count > 0 && supporting > 0) s += $" ({supporting} grouped as supporting churn)";
        return s;
    }

    private static string JoinSentence(IEnumerable<string> items)
    {
        var arr = items.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct().ToArray();
        return arr.Length switch { 0 => "the raw diff", 1 => arr[0], 2 => $"{arr[0]} and {arr[1]}", _ => $"{string.Join(", ", arr[..^1])}, and {arr[^1]}" };
    }
}

// ──────────────────────────────────────────────────────────────────
// NarrativeComposer — walkthrough starter placeholder
// ──────────────────────────────────────────────────────────────────

static class NarrativeComposer
{
    public static IReadOnlyList<string> Build(WalkthroughRequest request, ReviewMetadata metadata)
    {
        var focusFiles = BriefComposer.GetFocusFiles(metadata.ChangedFiles).Take(3).ToArray();
        return
        [
            "<!-- walkthrough-starter -->",
            "_This starter is intentionally lightweight. Replace it with the actual reviewer narrative after inspecting the diff._",
            "",
            "### Narrative starter",
            "",
            BuildOpening(request, metadata, focusFiles),
            "",
            BuildGroundingPrompt(focusFiles),
            "",
            BuildFollowThrough(request, metadata, focusFiles),
            "",
            "### Refinement note",
            "",
            "As you turn this into the final walkthrough, explain the key behavior shift first, follow the flow through the most important files, and keep lower-signal churn in `## Supporting Notes` so the main story stays readable.",
            "<!-- /walkthrough-starter -->"
        ];
    }

    private static string BuildOpening(WalkthroughRequest request, ReviewMetadata metadata, IReadOnlyList<string> focus)
    {
        if (focus.Count == 0)
        {
            var source = !string.IsNullOrWhiteSpace(metadata.Title) ? $"the PR titled _{metadata.Title.Trim()}_"
                : request.Mode == ReviewSourceMode.PullRequestUrl ? request.SourceLabel : $"`{request.BaseBranch}...{request.HeadBranch}`";
            return $"Use this section to turn {source} into a reviewer-facing story: identify the first behavior-changing file, explain the logic shift in plain language, and only then branch out.";
        }
        var first = $"`{focus[0]}`";
        var rest = JoinPaths(focus.Skip(1).ToArray(), "the rest of the high-signal diff");
        return $"A reviewer-friendly way to read this change is to start in {first}, where the semantic core most likely lives, then follow the flow into {rest}. That keeps the walkthrough grounded in how the behavior unfolds instead of repeating the diff one file at a time.";
    }

    private static string BuildGroundingPrompt(IReadOnlyList<string> focus) =>
        focus.Count == 0
            ? "As you refine this section, cite the concrete files you inspected and only pull in a small excerpt when it genuinely sharpens reviewer understanding."
            : $"Keep each major walkthrough segment tied to real paths such as {JoinPaths(focus, "the relevant diff")}, and add a focused hunk only when the actual excerpt changes how the reviewer reads the behavior.";

    private static string BuildFollowThrough(WalkthroughRequest request, ReviewMetadata metadata, IReadOnlyList<string> focus)
    {
        if (focus.Count == 0)
            return "Once the main path is clear, use the remaining changes to confirm wiring, docs, or cleanup impact.";
        var subject = !string.IsNullOrWhiteSpace(metadata.Title) ? $"For _{metadata.Title.Trim()}_,"
            : request.Mode == ReviewSourceMode.LocalCompare ? $"For `{request.BaseBranch}...{request.HeadBranch}`," : "For this PR,";
        return $"{subject} the strongest narrative usually explains what changed in the core code path, why that change matters to a reviewer, and how the surrounding files support or expose that behavior to the rest of the system.";
    }

    private static string JoinPaths(IReadOnlyList<string> paths, string fallback) =>
        paths.Count switch { 0 => fallback, 1 => $"`{paths[0]}`", 2 => $"`{paths[0]}` and `{paths[1]}`", _ => $"{string.Join(", ", paths.Take(paths.Count - 1).Select(p => $"`{p}`"))}, and `{paths[^1]}`" };
}

// ──────────────────────────────────────────────────────────────────
// CopilotReviewOrchestrator — spawns copilot to auto-populate
// ──────────────────────────────────────────────────────────────────

static class CopilotReviewOrchestrator
{
    public static async Task<ProcessResult> TryCompleteAsync(WalkthroughRequest request, string reviewFilePath)
    {
        var probe = await ProcessRunner.TryRunAsync("copilot", "--version");
        if (!probe.Success)
            return new(false, probe.StdOut, $"Could not run 'copilot'. {(string.IsNullOrWhiteSpace(probe.StdErr) ? probe.StdOut : probe.StdErr)}".Trim());

        var source = request.PullRequestUrl ?? $"{request.BaseBranch}...{request.HeadBranch}";
        var prompt = string.Join(Environment.NewLine,
        [
            "Complete the private PR review walkthrough in the current repository.",
            $"Review source: {source}",
            $"Output Markdown file: {reviewFilePath}",
            "",
            "This file already contains a scaffold. Your job is to inspect the actual change and turn it into a finished reviewer aid.",
            "",
            "Required outcome:",
            "1. Refine `## Reviewer Brief` using the real diff and real surrounding context, not just metadata.",
            "2. Replace the starter content under `## Walkthrough` with a detailed linear walkthrough of the important logic changes.",
            "3. Use several substantial walkthrough steps when the PR warrants it, and keep the narrative reviewer-first and evidence-based.",
            $"4. Add focused grounded excerpts for the most important diff hunks. Use `dotnet run scribe.cs -- hunk --content` with real inspected hunks when the files are not local.",
            "5. Keep low-signal churn brief under `## Supporting Notes`.",
            "6. Do not leave the `<!-- walkthrough-starter -->` placeholder in the final file.",
            "",
            "How to work:",
            "- For GitHub PR URLs, inspect the diff with commands like `gh pr view <url>` and `gh pr diff <url>`.",
            "- For local compares, inspect with `git diff <base>...<head>` and read relevant files as needed.",
            $"- Use `dotnet run scribe.cs -- note|step|hunk|undo --file \"...\"` as the primary way to update the document.",
            "- Prefer concise reviewer-facing prose tied to concrete file paths.",
            "- Do not post anything to GitHub or publish the output anywhere else.",
            "",
            "You are done only when the Markdown file itself contains a real walkthrough with concrete grounded details."
        ]);

        return await ProcessRunner.TryRunWithTimeoutAsync("copilot", TimeSpan.FromMinutes(8),
            "--allow-all-tools", "--allow-all-paths", "--allow-all-urls", "--no-ask-user", "--effort", "high", "--silent", "-p", prompt);
    }
}

// ──────────────────────────────────────────────────────────────────
// ProcessRunner
// ──────────────────────────────────────────────────────────────────

sealed record ProcessResult(bool Success, string StdOut, string StdErr);

static class ProcessRunner
{
    public static Task<ProcessResult> TryRunAsync(string fileName, params string[] arguments) =>
        RunInternalAsync(fileName, null, arguments);

    public static Task<ProcessResult> TryRunWithTimeoutAsync(string fileName, TimeSpan timeout, params string[] arguments) =>
        RunInternalAsync(fileName, timeout, arguments);

    private static async Task<ProcessResult> RunInternalAsync(string fileName, TimeSpan? timeout, params string[] arguments)
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WorkingDirectory = Directory.GetCurrentDirectory(),
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            foreach (var arg in arguments) proc.StartInfo.ArgumentList.Add(arg);
            proc.Start();

            var stdOutTask = proc.StandardOutput.ReadToEndAsync();
            var stdErrTask = proc.StandardError.ReadToEndAsync();

            if (timeout is { } limit)
            {
                try { await proc.WaitForExitAsync().WaitAsync(limit); }
                catch (TimeoutException)
                {
                    try { if (!proc.HasExited) proc.Kill(entireProcessTree: true); } catch { }
                    return new(false, await stdOutTask, $"Timed out after {limit.TotalMinutes:0.#} min.{Environment.NewLine}{await stdErrTask}".Trim());
                }
            }
            else
            {
                await proc.WaitForExitAsync();
            }

            return new(proc.ExitCode == 0, await stdOutTask, await stdErrTask);
        }
        catch (Exception ex)
        {
            return new(false, "", ex.Message);
        }
    }
}

// ──────────────────────────────────────────────────────────────────
// UserInputException
// ──────────────────────────────────────────────────────────────────

sealed class UserInputException(string message) : Exception(message);
