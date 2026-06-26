#:property TargetFramework=net10.0
#:package CopyOnWrite@0.5.0

// git-cow-worktree: create a git worktree whose working tree is seeded with
// copy-on-write (reflink) clones of an existing worktree, so most files share
// on-disk blocks instead of being copied.
//
// Approach (after josharian/git-cow-worktree):
//   1. git worktree add --no-checkout <path> [<commit-ish>]
//   2. pick a "similar" existing worktree as the reflink source
//   3. reflink every tracked file whose committed blob is identical in both
//      the source and the target tree
//   4. git checkout -f HEAD to fill in missing/mismatched files and refresh
//      the index stat cache
//
// CoW reflinks only work within a single CoW-capable volume:
//   Windows: ReFS / Dev Drive   Linux: Btrfs, XFS, ZFS   macOS: APFS
// The Microsoft CopyOnWrite library is used to *detect* support and to clone
// on Windows; on Linux/macOS File.Copy already reflinks automatically on a
// supported filesystem (.NET 7+ / .NET 8+).

using System.Diagnostics;
using System.Text;
using Microsoft.CopyOnWrite;

const string Tool = "git-cow-worktree";

try
{
    return Run(args);
}
catch (UsageException ue)
{
    Console.Error.WriteLine($"{Tool}: {ue.Message}");
    Console.Error.WriteLine();
    PrintUsage();
    return 2;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"{Tool}: {ex.Message}");
    return 1;
}

int Run(string[] argv)
{
    var o = ParseArgs(argv);
    if (o.ShowHelp)
    {
        PrintUsage();
        return 0;
    }
    if (string.IsNullOrEmpty(o.TargetPath))
        throw new UsageException("missing <path> argument");

    var sw = Stopwatch.StartNew();
    void Phase(string name, long startMs)
    {
        if (o.Verbose)
            Console.Error.WriteLine($"{Tool}: {name,-18} {sw.ElapsedMilliseconds - startMs} ms");
    }

    string repoDir = Path.GetFullPath(o.RepoDir ?? Directory.GetCurrentDirectory());
    string repoRoot = GitOut(repoDir, "rev-parse", "--show-toplevel").Trim();
    if (repoRoot.Length == 0)
        throw new Exception($"not a git repository: {repoDir}");
    // git prints forward slashes on Windows; normalize so the CoW library
    // (and Path APIs) get a proper platform path.
    repoRoot = Path.GetFullPath(repoRoot);

    string targetAbs = Path.GetFullPath(o.TargetPath);
    string targetParent = Path.GetDirectoryName(targetAbs) ?? targetAbs;

    // Resolve the source worktree first so the CoW capability check is meaningful.
    var worktrees = ListWorktrees(repoRoot);
    Worktree? source = o.SourcePath is not null
        ? ResolveExplicitSource(o.SourcePath, worktrees)
        : null;

    var cow = CopyOnWriteFilesystemFactory.GetInstance();

    // ---- Capability check: does the drive support what we need? ----
    // We need a directory to test the destination volume against. Use the
    // target's parent (the target itself does not exist yet).
    string destProbe = Directory.Exists(targetParent) ? targetParent : repoRoot;
    string srcProbe = source?.Path ?? repoRoot;
    bool cowSupported = CoWSupportedBetween(cow, srcProbe, destProbe);

    if (o.Verbose)
        Console.Error.WriteLine($"{Tool}: CoW between '{srcProbe}' and '{destProbe}': {(cowSupported ? "supported" : "NOT supported")}");

    if (o.DryRun)
        return DryRun(o, repoRoot, targetAbs, worktrees, source, cow, cowSupported);

    if (!cowSupported)
    {
        string detail = OperatingSystem.IsWindows()
            ? "the destination volume is not ReFS/Dev Drive, or source and target are on different volumes"
            : "the filesystem is not CoW-capable (need Btrfs/XFS/ZFS on Linux or APFS on macOS), or source and target are on different volumes";
        Console.Error.WriteLine(
            $"{Tool}: copy-on-write not available ({detail}); creating a regular worktree (no disk savings).");
    }

    // ---- Step 1: create the worktree without checking files out. ----
    long t = sw.ElapsedMilliseconds;
    var addArgs = new List<string> { "worktree", "add", "--no-checkout" };
    addArgs.AddRange(o.ForwardFlags);
    addArgs.Add(targetAbs);
    if (!string.IsNullOrEmpty(o.CommitIsh))
        addArgs.Add(o.CommitIsh!);
    GitCheck(repoRoot, addArgs.ToArray());
    Phase("worktree add", t);

    string targetSha = GitOut(targetAbs, "rev-parse", "--verify", "HEAD^{commit}").Trim();

    // ---- Step 2: choose a reflink source (only when CoW is available). ----
    int seeded = 0, attempted = 0;
    if (cowSupported && source is null)
    {
        t = sw.ElapsedMilliseconds;
        source = PickAutoSource(repoRoot, worktrees, targetAbs, targetSha, o.Verbose);
        Phase("pick source", t);
    }

    if (cowSupported && source is not null)
    {
        // ---- Step 3: reflink files whose committed blob matches. ----
        t = sw.ElapsedMilliseconds;
        var targetTree = LsTree(targetAbs, targetSha);
        var sourceTree = LsTree(source.Path, source.Head);
        var paths = ReflinkSet(sourceTree, targetTree);
        Phase("diff trees", t);

        t = sw.ElapsedMilliseconds;
        (seeded, attempted) = ReflinkAll(cow, source.Path, targetAbs, paths);
        Phase("reflink", t);

        if (o.Verbose)
            Console.Error.WriteLine($"{Tool}: source={source.Path} reflinked {seeded}/{attempted} tracked files");
    }
    else if (o.Verbose)
    {
        Console.Error.WriteLine($"{Tool}: no reflink seeding; checking out directly");
    }

    // ---- Step 4: let git finish the checkout and refresh the index. ----
    t = sw.ElapsedMilliseconds;
    GitCheck(targetAbs, "-c", "checkout.workers=0", "checkout", "-f", "HEAD");
    RunPostCheckoutHook(targetAbs, targetSha, o.Verbose);
    Phase("checkout", t);

    Console.WriteLine(
        $"{Tool}: created worktree at {targetAbs}" +
        (cowSupported && source is not null
            ? $" (reflinked {seeded}/{attempted} files from {source.Path})"
            : " (regular checkout)"));
    if (o.Verbose)
        Console.Error.WriteLine($"{Tool}: total {sw.ElapsedMilliseconds} ms");
    return 0;
}

int DryRun(Options o, string repoRoot, string targetAbs, List<Worktree> worktrees, Worktree? source,
    ICopyOnWriteFilesystem cow, bool cowSupported)
{
    string baseRef = string.IsNullOrEmpty(o.CommitIsh) ? "HEAD" : o.CommitIsh!;
    string targetSha = GitOut(repoRoot, "rev-parse", "--verify", baseRef + "^{commit}").Trim();
    source ??= PickAutoSource(repoRoot, worktrees, targetAbs, targetSha, o.Verbose);

    Console.WriteLine($"{Tool}: DRY RUN");
    Console.WriteLine($"  repo:        {repoRoot}");
    Console.WriteLine($"  new worktree: {targetAbs}");
    Console.WriteLine($"  commit-ish:  {baseRef} -> {Short(targetSha)}");
    Console.WriteLine($"  CoW capable: {(cowSupported ? "yes" : "no (would use a regular checkout)")}");

    if (cowSupported && source is not null)
    {
        var targetTree = LsTree(repoRoot, targetSha);
        var sourceTree = LsTree(source.Path, source.Head);
        var paths = ReflinkSet(sourceTree, targetTree);
        Console.WriteLine($"  source:      {source.Path} ({Short(source.Head)})");
        Console.WriteLine($"  would reflink {paths.Count} of {targetTree.Count} tracked files");
    }
    else
    {
        Console.WriteLine("  source:      (none) - would use a regular checkout");
    }
    return 0;
}

// ---------------- CoW helpers ----------------

bool CoWSupportedBetween(ICopyOnWriteFilesystem cow, string source, string destination)
{
    try
    {
        return cow.CopyOnWriteLinkSupportedBetweenPaths(source, destination);
    }
    catch
    {
        return false;
    }
}

void CloneFile(ICopyOnWriteFilesystem cow, string source, string dest)
{
    if (OperatingSystem.IsWindows())
        cow.CloneFile(source, dest); // ReFS / Dev Drive block clone
    else
        File.Copy(source, dest, overwrite: true); // reflinks automatically on Btrfs/XFS/APFS
}

(int seeded, int attempted) ReflinkAll(ICopyOnWriteFilesystem cow, string srcRoot, string dstRoot, List<string> paths)
{
    int seeded = 0;
    int unsupported = 0;
    var options = new ParallelOptions { MaxDegreeOfParallelism = Math.Min(Environment.ProcessorCount, 16) };
    Parallel.ForEach(paths, options, rel =>
    {
        if (Volatile.Read(ref unsupported) != 0)
            return;
        string src = Path.Combine(srcRoot, rel);
        string dst = Path.Combine(dstRoot, rel);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            CloneFile(cow, src, dst);
            Interlocked.Increment(ref seeded);
        }
        catch (NotSupportedException)
        {
            // CoW turned out to be unsupported for this pair: stop seeding and
            // let the final checkout populate the rest.
            Interlocked.Exchange(ref unsupported, 1);
        }
        catch
        {
            // Per-file failure (e.g. source file missing because the source
            // working tree is dirty): leave it for the checkout to fill in.
        }
    });
    return (seeded, paths.Count);
}

// ---------------- git tree helpers ----------------

Dictionary<string, TreeEntry> LsTree(string repoDir, string reference)
{
    string outText = GitOut(repoDir, "ls-tree", "-r", "-z", reference);
    var map = new Dictionary<string, TreeEntry>(StringComparer.Ordinal);
    foreach (string rec in outText.Split('\0'))
    {
        if (rec.Length == 0)
            continue;
        int tab = rec.IndexOf('\t');
        if (tab < 0)
            continue;
        string head = rec[..tab];
        string path = rec[(tab + 1)..];
        string[] fields = head.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (fields.Length < 3)
            continue;
        map[path] = new TreeEntry(fields[0], fields[2]);
    }
    return map;
}

// Paths present (with identical mode and blob SHA) in both trees, restricted
// to regular files. Identical SHA guarantees identical committed content, so
// the reflink is safe; the final checkout fixes anything that is dirty.
List<string> ReflinkSet(Dictionary<string, TreeEntry> source, Dictionary<string, TreeEntry> target)
{
    var result = new List<string>(target.Count);
    foreach (var (path, te) in target)
    {
        if (te.Mode != "100644" && te.Mode != "100755")
            continue;
        if (source.TryGetValue(path, out var se) && se.Mode == te.Mode && se.Sha == te.Sha)
            result.Add(path);
    }
    return result;
}

List<Worktree> ListWorktrees(string repoRoot)
{
    string outText = GitOut(repoRoot, "worktree", "list", "--porcelain", "-z");
    var list = new List<Worktree>();
    string[] records = outText.TrimEnd('\0').Split("\0\0", StringSplitOptions.None);
    for (int i = 0; i < records.Length; i++)
    {
        string rec = records[i];
        if (rec.Length == 0)
            continue;
        string path = "", head = "";
        bool bare = false;
        bool isMain = i == 0;
        foreach (string field in rec.Split('\0', StringSplitOptions.RemoveEmptyEntries))
        {
            if (field.StartsWith("worktree ", StringComparison.Ordinal))
                path = field["worktree ".Length..];
            else if (field.StartsWith("HEAD ", StringComparison.Ordinal))
            {
                string h = field["HEAD ".Length..];
                if (h != new string('0', h.Length))
                    head = h;
            }
            else if (field == "bare")
                bare = true;
        }
        if (path.Length != 0)
            list.Add(new Worktree(Path.GetFullPath(path), head, bare, isMain));
    }
    return list;
}

Worktree ResolveExplicitSource(string sourcePath, List<Worktree> worktrees)
{
    string abs = Path.GetFullPath(sourcePath);
    foreach (var w in worktrees)
    {
        if (SamePath(w.Path, abs))
            return w;
    }
    // Not a registered worktree: accept it anyway if it resolves to a HEAD.
    string head = GitOut(abs, "rev-parse", "--verify", "HEAD^{commit}").Trim();
    return new Worktree(abs, head, false, false);
}

// Pick the materialized, non-bare worktree closest (fewest commits ahead+behind)
// to the target commit. Prefer the main worktree on ties.
Worktree? PickAutoSource(string repoRoot, List<Worktree> worktrees, string targetAbs, string targetSha, bool verbose)
{
    Worktree? best = null;
    int bestScore = int.MaxValue;
    int bestRank = int.MaxValue;
    foreach (var w in worktrees)
    {
        if (w.Bare || w.Head.Length == 0)
            continue;
        if (SamePath(w.Path, targetAbs))
            continue;
        int score = CommitDistance(repoRoot, w.Head, targetSha);
        int rank = w.IsMain ? 0 : 1;
        if (score < bestScore || (score == bestScore && rank < bestRank))
        {
            best = w;
            bestScore = score;
            bestRank = rank;
        }
    }
    if (verbose && best is not null)
        Console.Error.WriteLine($"{Tool}: auto-picked source {best.Path} (distance {bestScore} commits)");
    return best;
}

int CommitDistance(string repoDir, string a, string b)
{
    var (code, outText, _) = Git(repoDir, "rev-list", "--left-right", "--count", a + "..." + b);
    if (code != 0)
        return int.MaxValue - 1;
    string[] parts = outText.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
    if (parts.Length != 2 || !int.TryParse(parts[0], out int ahead) || !int.TryParse(parts[1], out int behind))
        return int.MaxValue - 1;
    return ahead + behind;
}

void RunPostCheckoutHook(string worktreeDir, string targetSha, bool verbose)
{
    string zero = new string('0', targetSha.Length);
    var (code, _, err) = Git(worktreeDir, "hook", "run", "--ignore-missing", "post-checkout", "--", zero, targetSha, "1");
    if (code != 0 && verbose)
        Console.Error.WriteLine($"{Tool}: post-checkout hook returned {code}: {err.Trim()}");
}

// ---------------- process helpers ----------------

(int code, string stdout, string stderr) Git(string? workdir, params string[] gitArgs)
{
    var psi = new ProcessStartInfo("git")
    {
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        StandardOutputEncoding = Encoding.UTF8,
        StandardErrorEncoding = Encoding.UTF8,
    };
    if (workdir is not null)
        psi.WorkingDirectory = workdir;
    foreach (string a in gitArgs)
        psi.ArgumentList.Add(a);

    using var p = Process.Start(psi) ?? throw new Exception("failed to start git");
    var so = p.StandardOutput.ReadToEndAsync();
    var se = p.StandardError.ReadToEndAsync();
    p.WaitForExit();
    return (p.ExitCode, so.Result, se.Result);
}

string GitOut(string? workdir, params string[] gitArgs)
{
    var (code, outText, err) = Git(workdir, gitArgs);
    if (code != 0)
        throw new Exception($"git {string.Join(' ', gitArgs)} failed ({code}): {err.Trim()}");
    return outText;
}

void GitCheck(string? workdir, params string[] gitArgs)
{
    var (code, outText, err) = Git(workdir, gitArgs);
    if (outText.Trim().Length != 0)
        Console.WriteLine(outText.TrimEnd());
    if (err.Trim().Length != 0)
        Console.Error.WriteLine(err.TrimEnd());
    if (code != 0)
        throw new Exception($"git {string.Join(' ', gitArgs)} failed ({code})");
}

bool SamePath(string a, string b) =>
    string.Equals(
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(a)),
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(b)),
        OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

string Short(string sha) => sha.Length >= 12 ? sha[..12] : sha;

// ---------------- argument parsing ----------------

Options ParseArgs(string[] argv)
{
    var o = new Options();
    var positional = new List<string>();
    for (int i = 0; i < argv.Length; i++)
    {
        string a = argv[i];
        switch (a)
        {
            case "-h" or "--help":
                o.ShowHelp = true;
                break;
            case "-v" or "--verbose":
                o.Verbose = true;
                break;
            case "--dry-run":
                o.DryRun = true;
                break;
            case "--repo":
                o.RepoDir = NextArg(argv, ref i, a);
                break;
            case "--source" or "--from":
                o.SourcePath = NextArg(argv, ref i, a);
                break;
            case "-b" or "-B" or "--reason":
                o.ForwardFlags.Add(a);
                o.ForwardFlags.Add(NextArg(argv, ref i, a));
                break;
            case "--detach" or "--force" or "-f" or "--lock":
                o.ForwardFlags.Add(a);
                break;
            default:
                if (a.StartsWith('-'))
                {
                    // Unknown flag: forward to `git worktree add` verbatim.
                    o.ForwardFlags.Add(a);
                }
                else
                {
                    positional.Add(a);
                }
                break;
        }
    }
    if (positional.Count > 0)
        o.TargetPath = positional[0];
    if (positional.Count > 1)
        o.CommitIsh = positional[1];
    if (positional.Count > 2)
        throw new UsageException($"unexpected argument: {positional[2]}");
    return o;
}

string NextArg(string[] argv, ref int i, string flag)
{
    if (i + 1 >= argv.Length)
        throw new UsageException($"{flag} requires an argument");
    return argv[++i];
}

void PrintUsage()
{
    Console.Error.WriteLine(
$"""
{Tool} - create a copy-on-write (reflink) git worktree

Usage:
  {Tool} <path> [<commit-ish>] [options]

Arguments:
  <path>          location for the new worktree
  <commit-ish>    branch/commit to check out (default: HEAD)

Options:
  --repo <dir>    repository to operate in (default: current directory)
  -b <branch>     create a new branch (forwarded to git worktree add)
  -B <branch>     create or reset a branch (forwarded)
  --source <dir>  worktree to reflink files from (default: auto-pick closest)
  --dry-run       show the plan and CoW capability without making changes
  -v, --verbose   print per-phase timing and details
  -h, --help      show this help

Copy-on-write requires source and target on the same CoW-capable volume
(Windows ReFS/Dev Drive, Linux Btrfs/XFS/ZFS, macOS APFS).
""");
}

// ---------------- types ----------------

sealed record TreeEntry(string Mode, string Sha);

sealed record Worktree(string Path, string Head, bool Bare, bool IsMain);

sealed class Options
{
    public string? TargetPath;
    public string? CommitIsh;
    public string? RepoDir;
    public string? SourcePath;
    public bool Verbose;
    public bool DryRun;
    public bool ShowHelp;
    public List<string> ForwardFlags = new();
}

sealed class UsageException(string message) : Exception(message);
