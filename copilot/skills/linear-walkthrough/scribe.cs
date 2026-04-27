// scribe.cs — incrementally edit an existing PR review walkthrough.
// Usage: dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note|step|hunk|prompt|undo|open --file <review.md> ...

#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

return RunScribe(args);

// ──────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────

static int RunScribe(string[] args)
{
    if (args.Length == 0 || args.Any(a => a is "--help" or "-h"))
    {
        PrintUsage();
        return 0;
    }

    try
    {
        var openAfterWrite = args.Contains("--open", StringComparer.OrdinalIgnoreCase);
        var filtered = args.Where(a => !a.Equals("--open", StringComparison.OrdinalIgnoreCase)).ToArray();

        if (filtered.Length == 0)
            throw new UserInputException("Pass one of: note, step, hunk, prompt, undo, open.");

        var verb = filtered[0].ToLowerInvariant();
        var verbArgs = filtered[1..];

        return verb switch
        {
            "note" => RunNote(verbArgs, openAfterWrite),
            "step" => RunStep(verbArgs, openAfterWrite),
            "hunk" => RunHunk(verbArgs, openAfterWrite),
            "prompt" => RunPrompt(verbArgs),
            "undo" => RunUndo(verbArgs, openAfterWrite),
            "open" => RunOpen(verbArgs),
            "init" => throw new UserInputException("Use the `linear-walkthrough` skill to start a walkthrough from a PR URL or local compare target."),
            _ => throw new UserInputException($"Unknown command '{verb}'. Use note, step, hunk, prompt, undo, or open.")
        };
    }
    catch (UserInputException ex)
    {
        Console.Error.WriteLine($"Error: {ex.Message}");
        Console.Error.WriteLine();
        PrintUsage();
        return 1;
    }
}

// ──────────────────────────────────────────────────────────────────
// Command runners
// ──────────────────────────────────────────────────────────────────

static int RunNote(string[] args, bool open)
{
    var text = GetRequired(args, "--text", "Use note with --text \"...\" to append a reviewer observation.");
    var paths = GetPathValues(args);
    var section = GetOpt(args, "--section") ?? "Walkthrough";
    var outputPath = ResolveExistingFile(args);

    MarkdownReviewEditor.AppendNote(outputPath, section, text, paths);
    Console.WriteLine($"Appended note to: {outputPath}");
    if (open) TryOpen(outputPath);
    return 0;
}

static int RunStep(string[] args, bool open)
{
    var title = GetRequired(args, "--title", "Use step with --title \"...\" to name the walkthrough segment.");
    var text = GetRequired(args, "--text", "Use step with --text \"...\" to add the narrative for that segment.");
    var paths = GetPathValues(args);
    var section = GetOpt(args, "--section") ?? "Walkthrough";
    var outputPath = ResolveExistingFile(args);

    MarkdownReviewEditor.AppendNarrativeStep(outputPath, section, title, text, paths);
    Console.WriteLine($"Added narrative step to: {outputPath}");
    if (open) TryOpen(outputPath);
    return 0;
}

static int RunHunk(string[] args, bool open)
{
    var fileReference = GetRequired(args, "--path", "Use hunk with --path <file> so the excerpt stays grounded in a real location.");
    var summary = GetRequired(args, "--summary", "Use hunk with --summary \"...\" to explain why the excerpt matters.");
    var lineRange = GetOpt(args, "--lines");
    var content = GetOpt(args, "--content");
    var displayReference = fileReference;
    var section = GetOpt(args, "--section") ?? "Walkthrough";

    if (string.IsNullOrWhiteSpace(content) == string.IsNullOrWhiteSpace(lineRange))
        throw new UserInputException("Use hunk with exactly one of --content \"@@ ...\" or --lines <start[-end]>.");

    if (!string.IsNullOrWhiteSpace(lineRange))
    {
        var range = GroundedExcerptLoader.ParseRange(lineRange);
        content = GroundedExcerptLoader.LoadExcerpt(fileReference, range);
        displayReference = GroundedExcerptLoader.BuildDisplayReference(fileReference, range);
    }

    var outputPath = ResolveExistingFile(args);
    MarkdownReviewEditor.AppendGroundedHunk(outputPath, section, displayReference, summary, content!);
    Console.WriteLine($"Inserted grounded hunk into: {outputPath}");
    if (open) TryOpen(outputPath);
    return 0;
}

static int RunPrompt(string[] args)
{
    var outputPath = ResolvePromptFile(args);
    Console.WriteLine(PromptTemplateRenderer.Render(outputPath));
    return 0;
}

static int RunUndo(string[] args, bool open)
{
    var outputPath = ResolveExistingFile(args);
    MarkdownReviewEditor.UndoLastAddition(outputPath);
    Console.WriteLine($"Removed the last helper-added block from: {outputPath}");
    if (open) TryOpen(outputPath);
    return 0;
}

static int RunOpen(string[] args)
{
    var outputPath = ResolveExistingFile(args);
    Console.WriteLine($"Opening review file: {outputPath}");
    TryOpen(outputPath);
    return 0;
}

// ──────────────────────────────────────────────────────────────────
// Arg helpers
// ──────────────────────────────────────────────────────────────────

static string? GetOpt(string[] args, string name)
{
    for (var i = 0; i < args.Length - 1; i++)
        if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    return null;
}

static string GetRequired(string[] args, string name, string error) =>
    GetOpt(args, name) is { Length: > 0 } v ? v : throw new UserInputException(error);

static IReadOnlyList<string> GetPathValues(string[] args)
{
    var paths = new List<string>();
    for (var i = 0; i < args.Length - 1; i++)
    {
        if (args[i].Equals("--path", StringComparison.OrdinalIgnoreCase) || args[i].Equals("--paths", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var c in args[i + 1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                if (!string.IsNullOrWhiteSpace(c)) paths.Add(c);
        }
    }
    return paths.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
}

// ──────────────────────────────────────────────────────────────────
// File resolution
// ──────────────────────────────────────────────────────────────────

static string ResolveExistingFile(string[] args)
{
    var explicit_ = GetOpt(args, "--file");
    var cwd = Directory.GetCurrentDirectory();
    if (!string.IsNullOrWhiteSpace(explicit_))
    {
        var p = Path.IsPathRooted(explicit_) ? explicit_ : Path.GetFullPath(Path.Combine(cwd, explicit_));
        if (!File.Exists(p))
            throw new UserInputException($"Couldn't find the review file at '{p}'. Use the `linear-walkthrough` skill first or pass --file <review.md>.");
        return p;
    }
    return ResolveOnlyReviewFile(cwd);
}

static string ResolvePromptFile(string[] args)
{
    var explicit_ = GetOpt(args, "--file");
    var cwd = Directory.GetCurrentDirectory();
    if (!string.IsNullOrWhiteSpace(explicit_))
        return Path.IsPathRooted(explicit_) ? explicit_ : Path.GetFullPath(Path.Combine(cwd, explicit_));

    var matches = Directory.GetFiles(cwd, "pr-review-*.md", SearchOption.TopDirectoryOnly);
    return matches.Length switch
    {
        1 => matches[0],
        0 => Path.Combine(cwd, "<review.md>"),
        _ => throw new UserInputException("Multiple review files found. Pass --file <review.md> so the prompt is tailored.")
    };
}

static string ResolveOnlyReviewFile(string cwd)
{
    var matches = Directory.GetFiles(cwd, "pr-review-*.md", SearchOption.TopDirectoryOnly);
    return matches.Length switch
    {
        1 => matches[0],
        0 => throw new UserInputException("No review file found in the current folder. Use the `linear-walkthrough` skill first or pass --file <review.md>."),
        _ => throw new UserInputException("Multiple review files found. Pass --file <review.md> so the helper knows which one to update.")
    };
}

// ──────────────────────────────────────────────────────────────────
// TryOpen
// ──────────────────────────────────────────────────────────────────

static void TryOpen(string path)
{
    try { Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true }); }
    catch (Exception ex) { Console.WriteLine($"Generated the file, but opening it failed: {ex.Message}"); }
}

static void PrintUsage()
{
    Console.WriteLine("""
        Add reviewer-facing notes to an existing PR walkthrough file.

        Usage:
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file <review.md> --path src/File.cs --text "Observation"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step --file <review.md> --title "Core flow" --path src/File.cs --text "Explain the change story"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file <review.md> --path src/File.cs --summary "Why it matters" --lines 18-30
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file <review.md> --path src/File.cs --summary "Why it matters" --content "@@ real diff hunk @@"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- prompt --file <review.md>
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- undo --file <review.md>
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- open --file <review.md>

        Notes:
        - This command assumes the review file already exists. Use the `linear-walkthrough` skill first.
        - `note`, `step`, and `hunk` preserve existing content and append structured Markdown blocks.
        - Pass `--section "Reviewer Brief"` to refine the top-level PR brief in place.
        - Pass `--section "Supporting Notes"` to park low-signal churn outside the main narrative.
        - Use `hunk` with `--lines <start[-end]>` for a focused local excerpt, or `--content` for a real diff hunk.
        - `prompt` prints a reusable Copilot prompt tailored to the current review file.
        - `undo` removes the last helper-added block.
        - If `--file` is omitted, the helper uses the only `pr-review-*.md` file in the current folder.
        """);
}

// ──────────────────────────────────────────────────────────────────
// MarkdownReviewEditor
// ──────────────────────────────────────────────────────────────────

static class MarkdownReviewEditor
{
    private const string EntryStartMarker = "<!-- review-helper-entry:";
    private const string EntryEndMarker = "<!-- /review-helper-entry -->";
    private const string WalkthroughStarterStartMarker = "<!-- walkthrough-starter -->";
    private const string WalkthroughStarterEndMarker = "<!-- /walkthrough-starter -->";

    public static void AppendNote(string path, string sectionTitle, string text, IReadOnlyList<string> groundingPaths)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm 'UTC'");
        var groundingLine = BuildGroundingLine(groundingPaths);
        var entry = BuildEntry("note",
            $$"""
            ### Note - {{timestamp}}

            {{groundingLine}}
            {{(string.IsNullOrWhiteSpace(groundingLine) ? "" : Environment.NewLine)}}
            {{text.Trim()}}
            """);
        InsertIntoSection(path, sectionTitle, entry);
    }

    public static void AppendNarrativeStep(string path, string sectionTitle, string title, string text, IReadOnlyList<string> groundingPaths)
    {
        var groundingLine = BuildGroundingLine(groundingPaths);
        var entry = BuildEntry("step",
            $$"""
            ### {{title.Trim()}}

            {{groundingLine}}
            {{(string.IsNullOrWhiteSpace(groundingLine) ? "" : Environment.NewLine)}}
            {{text.Trim()}}
            """);
        InsertIntoSection(path, sectionTitle, entry);
    }

    public static void AppendGroundedHunk(string path, string sectionTitle, string fileReference, string summary, string excerpt)
    {
        var codeFence = DetectCodeFence(fileReference, excerpt);
        var entry = BuildEntry("hunk",
            $$"""
            ### Grounded hunk - `{{fileReference.Trim()}}`

            **Why it matters:** {{summary.Trim()}}

            ```{{codeFence}}
            {{excerpt.Trim()}}
            ```
            """);
        InsertIntoSection(path, sectionTitle, entry);
    }

    public static void UndoLastAddition(string path)
    {
        var content = File.ReadAllText(path);
        var startIndex = content.LastIndexOf(EntryStartMarker, StringComparison.Ordinal);
        if (startIndex < 0)
            throw new UserInputException("There are no helper-added note, step, or hunk blocks to undo in this file.");

        var endIndex = content.IndexOf(EntryEndMarker, startIndex, StringComparison.Ordinal);
        if (endIndex < 0)
            throw new UserInputException("The last helper block looks incomplete, so undo could not be applied safely.");

        var removeLength = (endIndex + EntryEndMarker.Length) - startIndex;
        var updated = content.Remove(startIndex, removeLength);
        updated = updated.Replace("\r\n\r\n\r\n", "\r\n\r\n", StringComparison.Ordinal);
        updated = updated.Replace("\n\n\n", "\n\n", StringComparison.Ordinal);
        File.WriteAllText(path, updated.TrimEnd() + Environment.NewLine);
    }

    private static void InsertIntoSection(string path, string sectionTitle, string entry)
    {
        var content = File.ReadAllText(path);
        var newline = content.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var normalized = content.Replace("\r\n", "\n", StringComparison.Ordinal);
        var normalizedEntry = entry.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        var header = $"## {sectionTitle.Trim()}";
        var sectionIndex = normalized.IndexOf(header, StringComparison.OrdinalIgnoreCase);

        if (sectionIndex < 0)
        {
            normalized = normalized.TrimEnd() + $"\n\n{header}\n\n{normalizedEntry}\n";
        }
        else
        {
            var contentStart = normalized.IndexOf('\n', sectionIndex);
            contentStart = contentStart < 0 ? normalized.Length : contentStart + 1;
            var nextSection = normalized.IndexOf("\n## ", contentStart, StringComparison.Ordinal);
            if (nextSection < 0) nextSection = normalized.Length;

            var existingSectionContent = normalized[contentStart..nextSection].Trim();
            if (IsPlaceholder(existingSectionContent)) existingSectionContent = string.Empty;

            var updatedSectionContent = string.IsNullOrWhiteSpace(existingSectionContent)
                ? normalizedEntry
                : $"{existingSectionContent}\n\n{normalizedEntry}";

            normalized = normalized[..contentStart] + updatedSectionContent + "\n\n" + normalized[nextSection..].TrimStart('\n');
        }

        File.WriteAllText(path, normalized.Replace("\n", newline, StringComparison.Ordinal));
    }

    private static string BuildEntry(string kind, string body)
    {
        var entryId = $"{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}-{kind}";
        return $$"""
        {{EntryStartMarker}} {{entryId}} -->
        {{body.Trim()}}
        {{EntryEndMarker}}
        """;
    }

    private static string BuildGroundingLine(IReadOnlyList<string> groundingPaths)
    {
        var clean = groundingPaths.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        return clean.Length == 0 ? string.Empty : $"**Grounded in:** {string.Join(", ", clean.Select(p => $"`{p}`"))}";
    }

    private static string DetectCodeFence(string fileReference, string excerpt)
    {
        var trimmed = excerpt.TrimStart();
        if (trimmed.StartsWith("@@", StringComparison.Ordinal) || trimmed.StartsWith("+", StringComparison.Ordinal) || trimmed.StartsWith("-", StringComparison.Ordinal))
            return "diff";

        var referenceWithoutAnchor = fileReference.Split('#', 2)[0];
        return Path.GetExtension(referenceWithoutAnchor).ToLowerInvariant() switch
        {
            ".cs" => "csharp",
            ".ts" => "ts",
            ".tsx" => "tsx",
            ".js" => "js",
            ".jsx" => "jsx",
            ".json" => "json",
            ".md" => "md",
            ".yml" or ".yaml" => "yaml",
            ".xml" => "xml",
            ".html" => "html",
            ".css" => "css",
            ".sql" => "sql",
            ".sh" => "bash",
            ".ps1" => "powershell",
            _ => "text"
        };
    }

    private static bool IsPlaceholder(string sectionContent)
    {
        var trimmed = sectionContent.Trim();
        if (trimmed.Contains(WalkthroughStarterStartMarker, StringComparison.Ordinal)
            && trimmed.Contains(WalkthroughStarterEndMarker, StringComparison.Ordinal))
            return true;
        return trimmed is "_Reserved for the narrative walkthrough._" or "_Use this section for low-signal or follow-up details._";
    }
}

// ──────────────────────────────────────────────────────────────────
// GroundedExcerptLoader
// ──────────────────────────────────────────────────────────────────

sealed record LineRange(int Start, int End);

static class GroundedExcerptLoader
{
    public static LineRange ParseRange(string value)
    {
        var trimmed = value.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            throw new UserInputException("Use --lines with a value like 18-30 or 18:30 so the helper can extract a focused excerpt.");

        var pieces = trimmed.Split(['-', ':'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (pieces.Length is < 1 or > 2 || !int.TryParse(pieces[0], out var start))
            throw new UserInputException("Use --lines with a value like 18-30 or 18:30 so the helper can extract a focused excerpt.");

        var end = start;
        if (pieces.Length == 2 && !int.TryParse(pieces[1], out end))
            throw new UserInputException("Use --lines with a value like 18-30 or 18:30 so the helper can extract a focused excerpt.");

        if (start <= 0 || end <= 0 || end < start)
            throw new UserInputException("Line ranges must be positive and ordered, for example --lines 18-30.");

        return new LineRange(start, end);
    }

    public static string LoadExcerpt(string fileReference, LineRange range)
    {
        var fullPath = Path.IsPathRooted(fileReference) ? fileReference : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), fileReference));
        if (!File.Exists(fullPath))
            throw new UserInputException($"Couldn't load '{fileReference}' for --lines because the file does not exist at '{fullPath}'. Use --content when citing a diff-only hunk.");

        var lines = File.ReadAllLines(fullPath);
        if (range.Start > lines.Length || range.End > lines.Length)
            throw new UserInputException($"Couldn't load lines {range.Start}-{range.End} from '{fileReference}' because the file only has {lines.Length} lines.");

        return string.Join(Environment.NewLine, lines[(range.Start - 1)..range.End]);
    }

    public static string BuildDisplayReference(string fileReference, LineRange range) =>
        range.Start == range.End ? $"{fileReference.Trim()}#L{range.Start}" : $"{fileReference.Trim()}#L{range.Start}-L{range.End}";
}

// ──────────────────────────────────────────────────────────────────
// PromptTemplateRenderer
// ──────────────────────────────────────────────────────────────────

static class PromptTemplateRenderer
{
    public static string Render(string reviewFilePath) => string.Join(Environment.NewLine,
    [
        "# Reusable Copilot review prompt",
        "",
        "Copy the block below into Copilot after you have initialized the review file.",
        "",
        "```text",
        "You are helping write a private PR review walkthrough for local use only.",
        $"Use the existing Markdown file at `{reviewFilePath}` as the output target.",
        "",
        "Goals:",
        "1. Refine `## Reviewer Brief` first. Keep it concise and evidence-based with bullets for what changed, why it matters, where to focus first, and a confidence note when intent is inferred.",
        "2. Then turn `## Walkthrough` into a coherent narrative in the order that best helps a reviewer understand the semantic core of the change.",
        "   - Keep the top-level `## Walkthrough` section, but feel free to choose whatever subheadings or flow best fits this PR.",
        "3. Keep the walkthrough focused on reviewer understanding by default rather than bug-hunting or broad speculation.",
        "4. Make each substantive walkthrough segment cite the real file paths it depends on.",
        "5. When a snippet helps, use a focused excerpt or diff hunk that was actually inspected rather than paraphrasing from memory.",
        "6. Put low-signal churn in `## Supporting Notes` by default, especially tests, localization updates, generated artifacts, or workflow bookkeeping. Keep that section brief unless one of those files turns out to be central.",
        "",
        "Guardrails:",
        "- Keep everything private and local in v1. Do not post to GitHub, create comments, or publish the output anywhere else.",
        "- Do not invent code, excerpts, or intent that you did not inspect. If something is inferred, say so plainly.",
        "- Avoid large code dumps unless a small excerpt is central to understanding the change.",
        "",
        "When you need to add grounded evidence, prefer commands like:",
        $"{HelperCommands.Scribe} -- note --file \"{reviewFilePath}\" --section \"Reviewer Brief\" --path src/auth.cs --text \"This appears to restructure the auth validation flow around empty-token handling.\"",
        $"{HelperCommands.Scribe} -- step --file \"{reviewFilePath}\" --title \"Validation now happens earlier\" --path src/auth.cs --path src/handlers/request.cs --text \"Start in src/auth.cs, where invalid tokens are rejected before the rest of the request path runs.\"",
        $"{HelperCommands.Scribe} -- note --file \"{reviewFilePath}\" --section \"Supporting Notes\" --path tests/auth.spec.ts --text \"Test coverage follows the core validation change.\"",
        $"{HelperCommands.Scribe} -- note --file \"{reviewFilePath}\" --text \"Short reviewer-facing observation\"",
        $"{HelperCommands.Scribe} -- hunk --file \"{reviewFilePath}\" --path src/File.cs --summary \"Why this matters\" --lines 18-30",
        $"{HelperCommands.Scribe} -- hunk --file \"{reviewFilePath}\" --path src/File.cs --summary \"Why this matters\" --content \"@@ real inspected diff hunk @@\"",
        "```"
    ]);
}

static class HelperCommands
{
    public const string Scribe = @"dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs";
}

// ──────────────────────────────────────────────────────────────────
// UserInputException
// ──────────────────────────────────────────────────────────────────

sealed class UserInputException(string message) : Exception(message);
