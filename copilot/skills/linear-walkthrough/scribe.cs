// scribe.cs — initialize and incrementally edit a self-contained HTML PR review walkthrough.
// Usage: dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- init|note|step|hunk|prompt|undo|open --file <review.html> ...

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
            throw new UserInputException("Pass one of: init, note, step, hunk, prompt, undo, open.");

        var verb = filtered[0].ToLowerInvariant();
        var verbArgs = filtered[1..];

        return verb switch
        {
            "init" => RunInit(verbArgs, openAfterWrite),
            "note" => RunNote(verbArgs, openAfterWrite),
            "step" => RunStep(verbArgs, openAfterWrite),
            "hunk" => RunHunk(verbArgs, openAfterWrite),
            "prompt" => RunPrompt(verbArgs),
            "undo" => RunUndo(verbArgs, openAfterWrite),
            "open" => RunOpen(verbArgs),
            _ => throw new UserInputException($"Unknown command '{verb}'. Use init, note, step, hunk, prompt, undo, or open.")
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

static int RunInit(string[] args, bool open)
{
    var title = GetRequired(args, "--title", "Use init with --title \"...\" to name the walkthrough.");
    var subtitle = GetOpt(args, "--subtitle");
    var force = args.Contains("--force", StringComparer.OrdinalIgnoreCase);

    var explicit_ = GetOpt(args, "--file");
    var cwd = Directory.GetCurrentDirectory();
    var outputPath = string.IsNullOrWhiteSpace(explicit_)
        ? Path.Combine(cwd, "pr-review.html")
        : (Path.IsPathRooted(explicit_) ? explicit_ : Path.GetFullPath(Path.Combine(cwd, explicit_)));

    if (File.Exists(outputPath) && !force)
        throw new UserInputException($"'{outputPath}' already exists. Pass --force to overwrite, or use note/step/hunk to update it in place.");

    HtmlReviewEditor.WriteScaffold(outputPath, title, subtitle);
    Console.WriteLine($"Initialized HTML walkthrough at: {outputPath}");
    if (open) TryOpen(outputPath);
    return 0;
}

static int RunNote(string[] args, bool open)
{
    var text = GetRequired(args, "--text", "Use note with --text \"...\" to append a reviewer observation.");
    var paths = GetPathValues(args);
    var section = GetOpt(args, "--section") ?? "Walkthrough";
    var outputPath = ResolveExistingFile(args);

    HtmlReviewEditor.AppendNote(outputPath, section, text, paths);
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

    HtmlReviewEditor.AppendNarrativeStep(outputPath, section, title, text, paths);
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
    var lang = LanguageDetector.Detect(fileReference, content!);
    HtmlReviewEditor.AppendGroundedHunk(outputPath, section, displayReference, summary, content!, lang);
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
    HtmlReviewEditor.UndoLastAddition(outputPath);
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
            throw new UserInputException($"Couldn't find the review file at '{p}'. Run `scribe init` (or use the `linear-walkthrough` skill) first, or pass --file <review.html>.");
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

    var matches = Directory.GetFiles(cwd, "pr-review-*.html", SearchOption.TopDirectoryOnly);
    return matches.Length switch
    {
        1 => matches[0],
        0 => Path.Combine(cwd, "<review.html>"),
        _ => throw new UserInputException("Multiple review files found. Pass --file <review.html> so the prompt is tailored.")
    };
}

static string ResolveOnlyReviewFile(string cwd)
{
    var matches = Directory.GetFiles(cwd, "pr-review-*.html", SearchOption.TopDirectoryOnly);
    return matches.Length switch
    {
        1 => matches[0],
        0 => throw new UserInputException("No review file found in the current folder. Run `scribe init` (or use the `linear-walkthrough` skill) first, or pass --file <review.html>."),
        _ => throw new UserInputException("Multiple review files found. Pass --file <review.html> so the helper knows which one to update.")
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
        Initialize and incrementally edit a self-contained HTML PR walkthrough.

        Usage:
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- init --file <review.html> --title "PR #123 — feature"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- note --file <review.html> --path src/File.cs --text "Observation"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- step --file <review.html> --title "Core flow" --path src/File.cs --text "Explain the change story"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file <review.html> --path src/File.cs --summary "Why it matters" --lines 18-30
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- hunk --file <review.html> --path src/File.cs --summary "Why it matters" --content "@@ real diff hunk @@"
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- prompt --file <review.html>
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- undo --file <review.html>
          dotnet run C:\repos\dotfiles\copilot\skills\linear-walkthrough\scribe.cs -- open --file <review.html>

        Notes:
        - `init` writes a self-contained HTML scaffold (inline CSS, no external dependencies). Pass --subtitle "..." for a source line, --force to overwrite.
        - `note`, `step`, and `hunk` preserve existing content and append structured HTML blocks into a section.
        - Pass `--section "Reviewer Brief"` to refine the top-level PR brief in place; `--section "Supporting Notes"` to park low-signal churn. Unknown sections are created.
        - Use `hunk` with `--lines <start[-end]>` for a focused local excerpt, or `--content` for a real diff hunk. Excerpt text is HTML-escaped.
        - `prompt` prints a reusable Copilot prompt tailored to the current review file.
        - `undo` removes the last helper-added block.
        - If `--file` is omitted, the helper uses the only `pr-review-*.html` file in the current folder.
        """);
}

// ──────────────────────────────────────────────────────────────────
// HtmlReviewEditor
// ──────────────────────────────────────────────────────────────────

static class HtmlReviewEditor
{
    private const string EntryStartMarker = "<!-- review-helper-entry:";
    private const string EntryEndMarker = "<!-- /review-helper-entry -->";

    public static void WriteScaffold(string path, string title, string? subtitle)
    {
        var safeTitle = Html.Escape(title.Trim());
        var subtitleHtml = string.IsNullOrWhiteSpace(subtitle)
            ? string.Empty
            : $"\n  <p class=\"subtitle\">{Html.Escape(subtitle.Trim())}</p>";

        var doc = ScaffoldTemplate
            .Replace("__TITLE__", safeTitle)
            .Replace("__SUBTITLE__", subtitleHtml)
            .Replace("__CSS__", Css);

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(path, doc);
    }

    public static void AppendNote(string path, string sectionTitle, string text, IReadOnlyList<string> groundingPaths)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm 'UTC'");
        var head = $"<div class=\"entry-head\"><span class=\"kind\">Note</span><time>{Html.Escape(timestamp)}</time></div>";
        var article = Html.Article("entry-note", head, Html.Grounding(groundingPaths), Html.Paragraphs(text));
        InsertIntoSection(path, sectionTitle, "note", article);
    }

    public static void AppendNarrativeStep(string path, string sectionTitle, string title, string text, IReadOnlyList<string> groundingPaths)
    {
        var head = $"<h3>{Html.Escape(title.Trim())}</h3>";
        var article = Html.Article("entry-step", head, Html.Grounding(groundingPaths), Html.Paragraphs(text));
        InsertIntoSection(path, sectionTitle, "step", article);
    }

    public static void AppendGroundedHunk(string path, string sectionTitle, string fileReference, string summary, string excerpt, string language)
    {
        var head = $"<div class=\"entry-head\"><span class=\"kind\">Grounded hunk</span><code class=\"ref\">{Html.Escape(fileReference.Trim())}</code></div>";
        var why = $"<p class=\"why\"><strong>Why it matters:</strong> {Html.Escape(summary.Trim())}</p>";
        var pre = $"<pre class=\"code lang-{Html.Escape(language)}\"><code>{Html.EscapeCode(excerpt.Trim())}</code></pre>";
        var article = Html.Article("entry-hunk", head, why, pre);
        InsertIntoSection(path, sectionTitle, "hunk", article);
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
        File.WriteAllText(path, updated);
    }

    private static void InsertIntoSection(string path, string sectionTitle, string kind, string articleHtml)
    {
        var raw = File.ReadAllText(path);
        var newline = raw.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var content = raw.Replace("\r\n", "\n", StringComparison.Ordinal);
        var block = BuildEntry(kind, articleHtml).Replace("\r\n", "\n", StringComparison.Ordinal);

        var marker = $"data-section=\"{sectionTitle.Trim()}\"";
        var sectionIndex = content.IndexOf(marker, StringComparison.OrdinalIgnoreCase);

        if (sectionIndex < 0)
        {
            var slug = Html.Slug(sectionTitle);
            var newSection =
                $"<section data-section=\"{Html.Escape(sectionTitle.Trim())}\" id=\"{slug}\">\n" +
                $"<h2>{Html.Escape(sectionTitle.Trim())}</h2>\n{block}\n</section>";

            var mainClose = content.LastIndexOf("</main>", StringComparison.Ordinal);
            content = mainClose < 0
                ? content.TrimEnd() + "\n" + newSection + "\n"
                : content[..mainClose].TrimEnd() + "\n" + newSection + "\n" + content[mainClose..];
        }
        else
        {
            var sectionClose = content.IndexOf("</section>", sectionIndex, StringComparison.Ordinal);
            if (sectionClose < 0)
                throw new UserInputException($"The review file is malformed: section '{sectionTitle}' has no closing </section> tag.");

            (content, sectionClose) = RemovePlaceholder(content, sectionIndex, sectionClose);

            var before = content[..sectionClose].TrimEnd();
            var after = content[sectionClose..];
            content = before + "\n" + block + "\n" + after;
        }

        File.WriteAllText(path, content.Replace("\n", newline, StringComparison.Ordinal));
    }

    private static (string content, int sectionClose) RemovePlaceholder(string content, int sectionStart, int sectionClose)
    {
        var pStart = content.IndexOf("<p class=\"placeholder\"", sectionStart, StringComparison.Ordinal);
        if (pStart < 0 || pStart >= sectionClose) return (content, sectionClose);

        var pEnd = content.IndexOf("</p>", pStart, StringComparison.Ordinal);
        if (pEnd < 0 || pEnd >= sectionClose) return (content, sectionClose);
        pEnd += "</p>".Length;

        var removeLength = pEnd - pStart;
        content = content.Remove(pStart, removeLength);
        return (content, sectionClose - removeLength);
    }

    private static string BuildEntry(string kind, string articleHtml)
    {
        var entryId = $"{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}-{kind}";
        return $"{EntryStartMarker} {entryId} -->\n{articleHtml.Trim()}\n{EntryEndMarker}";
    }

    private const string ScaffoldTemplate = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>__TITLE__</title>
        <style>
        __CSS__
        </style>
        </head>
        <body>
        <main>
        <header class="doc-head">
          <h1>__TITLE__</h1>__SUBTITLE__
        </header>
        <section data-section="Reviewer Brief" id="reviewer-brief">
        <h2>Reviewer Brief</h2>
        <p class="placeholder">Reserved for the reviewer brief: what changed, why it matters, where to focus first.</p>
        </section>
        <section data-section="Walkthrough" id="walkthrough">
        <h2>Walkthrough</h2>
        <p class="placeholder">Reserved for the narrative walkthrough.</p>
        </section>
        <section data-section="Supporting Notes" id="supporting-notes">
        <h2>Supporting Notes</h2>
        <p class="placeholder">Use this section for low-signal or follow-up details.</p>
        </section>
        </main>
        </body>
        </html>
        """;

    private const string Css = """
        :root { color-scheme: light dark; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1f2328;
          background: #f6f8fa;
        }
        main {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
        }
        .doc-head { margin-bottom: 1.5rem; }
        .doc-head h1 { margin: 0 0 .25rem; font-size: 1.8rem; line-height: 1.25; }
        .subtitle { margin: 0; color: #57606a; font-size: .95rem; }
        section {
          background: #ffffff;
          border: 1px solid #d0d7de;
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin: 1.25rem 0;
        }
        section > h2 {
          margin: 0 0 .75rem;
          padding-bottom: .4rem;
          border-bottom: 2px solid #d0d7de;
          font-size: 1.3rem;
        }
        .placeholder { color: #8c959f; font-style: italic; }
        .entry {
          border-left: 3px solid #d0d7de;
          padding: .25rem 0 .25rem 1rem;
          margin: 1rem 0;
        }
        .entry-step { border-left-color: #0969da; }
        .entry-note { border-left-color: #6e7781; }
        .entry-hunk { border-left-color: #1a7f37; }
        .entry h3 { margin: .2rem 0 .5rem; font-size: 1.1rem; }
        .entry-head {
          display: flex;
          align-items: center;
          gap: .6rem;
          flex-wrap: wrap;
          margin-bottom: .35rem;
        }
        .entry-head .kind {
          font-size: .72rem;
          text-transform: uppercase;
          letter-spacing: .04em;
          font-weight: 700;
          color: #57606a;
          background: #eaeef2;
          border-radius: 999px;
          padding: .1rem .55rem;
        }
        .entry-head time { color: #8c959f; font-size: .82rem; }
        .grounding { margin: .15rem 0 .5rem; font-size: .9rem; color: #57606a; }
        .why { margin: .25rem 0 .6rem; }
        code, .ref {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: .88em;
        }
        :not(pre) > code, .ref {
          background: #eff1f3;
          border-radius: 5px;
          padding: .1rem .35rem;
        }
        pre.code {
          background: #0d1117;
          color: #e6edf3;
          border-radius: 8px;
          padding: .85rem 1rem;
          overflow-x: auto;
          font-size: .85rem;
          line-height: 1.5;
        }
        pre.code code { background: none; padding: 0; color: inherit; }
        @media (prefers-color-scheme: dark) {
          body { color: #e6edf3; background: #0d1117; }
          section { background: #161b22; border-color: #30363d; }
          section > h2 { border-bottom-color: #30363d; }
          .subtitle, .entry-head time, .grounding, .entry-head .kind { color: #8b949e; }
          .entry-head .kind { background: #21262d; }
          :not(pre) > code, .ref { background: #21262d; }
          .entry, section > h2 { border-color: #30363d; }
        }
        """;
}

// ──────────────────────────────────────────────────────────────────
// Html helpers
// ──────────────────────────────────────────────────────────────────

static class Html
{
    public static string Escape(string s) => s
        .Replace("&", "&amp;", StringComparison.Ordinal)
        .Replace("<", "&lt;", StringComparison.Ordinal)
        .Replace(">", "&gt;", StringComparison.Ordinal)
        .Replace("\"", "&quot;", StringComparison.Ordinal);

    public static string EscapeCode(string s) => s
        .Replace("&", "&amp;", StringComparison.Ordinal)
        .Replace("<", "&lt;", StringComparison.Ordinal)
        .Replace(">", "&gt;", StringComparison.Ordinal);

    public static string Article(string cssKind, params string?[] parts)
    {
        var inner = parts.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim());
        return $"<article class=\"entry {cssKind}\">\n{string.Join("\n", inner)}\n</article>";
    }

    public static string Grounding(IReadOnlyList<string> paths)
    {
        var clean = paths.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (clean.Length == 0) return string.Empty;
        var refs = string.Join(", ", clean.Select(p => $"<code>{Escape(p)}</code>"));
        return $"<p class=\"grounding\"><strong>Grounded in:</strong> {refs}</p>";
    }

    public static string Paragraphs(string text)
    {
        var normalized = text.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (normalized.Length == 0) return string.Empty;

        var blocks = normalized.Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
        var sb = new StringBuilder();
        foreach (var block in blocks)
        {
            var inner = Escape(block.Trim()).Replace("\n", "<br />\n", StringComparison.Ordinal);
            sb.Append("<p>").Append(inner).Append("</p>\n");
        }
        return sb.ToString().TrimEnd();
    }

    public static string Slug(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var ch in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
            else if (sb.Length > 0 && sb[^1] != '-') sb.Append('-');
        }
        return sb.ToString().Trim('-') is { Length: > 0 } s ? s : "section";
    }
}

// ──────────────────────────────────────────────────────────────────
// LanguageDetector (CSS class hint for code blocks)
// ──────────────────────────────────────────────────────────────────

static class LanguageDetector
{
    public static string Detect(string fileReference, string excerpt)
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
        $"Use the existing self-contained HTML file at `{reviewFilePath}` as the output target. Update it only through the scribe helper so the HTML stays well-formed.",
        "",
        "Goals:",
        "1. Refine the \"Reviewer Brief\" section first. Keep it concise and evidence-based with what changed, why it matters, where to focus first, and a confidence note when intent is inferred.",
        "2. Then turn the \"Walkthrough\" section into a coherent narrative in the order that best helps a reviewer understand the semantic core of the change.",
        "3. Keep the walkthrough focused on reviewer understanding by default rather than bug-hunting or broad speculation.",
        "4. Make each substantive walkthrough segment cite the real file paths it depends on.",
        "5. When a snippet helps, use a focused excerpt or diff hunk that was actually inspected rather than paraphrasing from memory.",
        "6. Put low-signal churn in \"Supporting Notes\" by default, especially tests, localization updates, generated artifacts, or workflow bookkeeping. Keep that section brief unless one of those files turns out to be central.",
        "",
        "Guardrails:",
        "- Keep everything private and local. Do not post to GitHub, create comments, or publish the output anywhere else.",
        "- Do not invent code, excerpts, or intent that you did not inspect. If something is inferred, say so plainly.",
        "- Avoid large code dumps unless a small excerpt is central to understanding the change.",
        "",
        "When you need to add grounded evidence, prefer commands like:",
        $"{HelperCommands.Scribe} -- note --file \"{reviewFilePath}\" --section \"Reviewer Brief\" --path src/auth.cs --text \"This appears to restructure the auth validation flow around empty-token handling.\"",
        $"{HelperCommands.Scribe} -- step --file \"{reviewFilePath}\" --title \"Validation now happens earlier\" --path src/auth.cs --path src/handlers/request.cs --text \"Start in src/auth.cs, where invalid tokens are rejected before the rest of the request path runs.\"",
        $"{HelperCommands.Scribe} -- note --file \"{reviewFilePath}\" --section \"Supporting Notes\" --path tests/auth.spec.ts --text \"Test coverage follows the core validation change.\"",
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
