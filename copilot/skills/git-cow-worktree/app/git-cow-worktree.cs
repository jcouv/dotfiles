#:property TargetFramework=net10.0
#:package CopyOnWrite@0.5.0

// git-cow-worktree: create a git worktree whose working tree is seeded with
// copy-on-write (reflink) clones of an existing worktree, so most files share
// on-disk blocks instead of being copied.
//
// Approach (after josharian/git-cow-worktree):
//   1. git worktree add --no-checkout <path> [<commit-ish>]
//   2. reflink every tracked file of the target commit from the source worktree
//   3. git checkout -f HEAD to fill in missing/mismatched files and refresh
//      the index stat cache
//
// The source worktree is the current one by default (or --source <dir>). The
// final checkout makes the result identical to a plain `git worktree add`
// regardless of how many files were reflinked, so a "wrong" source only means
// fewer shared blocks, never a wrong working tree.
//
// CoW reflinks only work within a single CoW-capable volume:
//   Windows: ReFS / Dev Drive   Linux: Btrfs, XFS, ZFS   macOS: APFS
// The Microsoft CopyOnWrite library detects support and clones on Windows; on
// Linux/macOS File.Copy already reflinks automatically on a supported
// filesystem (.NET 7+ / .NET 8+).

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
            Console.Error.WriteLine($"{Tool}: {name,-14} {sw.ElapsedMilliseconds - startMs} ms");
    }

    string repoRoot = Path.GetFullPath(
        GitOut(Directory.GetCurrentDirectory(), "rev-parse", "--show-toplevel").Trim());
    string targetAbs = Path.GetFullPath(o.TargetPath);

    // Default source is the current worktree; --source overrides it.
    string sourcePath = o.SourcePath is not null ? Path.GetFullPath(o.SourcePath) : repoRoot;

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

    // ---- Step 2: probe CoW between the real source and the now-existing target. ----
    var cow = CopyOnWriteFilesystemFactory.GetInstance();
    bool cowSupported = CoWSupportedBetween(cow, sourcePath, targetAbs);
    if (o.Verbose)
        Console.Error.WriteLine(
            $"{Tool}: CoW between '{sourcePath}' and '{targetAbs}': {(cowSupported ? "supported" : "NOT supported")}");

    // ---- Step 3: reflink each tracked target file from the source (best effort). ----
    int seeded = 0, attempted = 0;
    if (cowSupported)
    {
        t = sw.ElapsedMilliseconds;
        var paths = TrackedFiles(targetAbs, targetSha);
        (seeded, attempted) = ReflinkAll(cow, sourcePath, targetAbs, paths);
        Phase("reflink", t);
        if (o.Verbose)
            Console.Error.WriteLine($"{Tool}: reflinked {seeded}/{attempted} tracked files from {sourcePath}");
    }
    else
    {
        Console.Error.WriteLine(
            $"{Tool}: copy-on-write not available ({CoWHint()}); creating a regular worktree (no disk savings).");
    }

    // ---- Step 4: let git finish the checkout and refresh the index. ----
    t = sw.ElapsedMilliseconds;
    GitCheck(targetAbs, "-c", "checkout.workers=0", "checkout", "-f", "HEAD");
    Phase("checkout", t);

    Console.WriteLine(
        $"{Tool}: created worktree at {targetAbs}" +
        (cowSupported ? $" (reflinked {seeded}/{attempted} files from {sourcePath})" : " (regular checkout)"));
    if (o.Verbose)
        Console.Error.WriteLine($"{Tool}: total {sw.ElapsedMilliseconds} ms");
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

string CoWHint() => OperatingSystem.IsWindows()
    ? "the destination volume is not ReFS/Dev Drive, or source and target are on different volumes"
    : "the filesystem is not CoW-capable (need Btrfs/XFS/ZFS on Linux or APFS on macOS), or source and target are on different volumes";

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
            // Per-file failure (e.g. the path does not exist in the source
            // worktree, or the source is dirty): leave it for the checkout.
        }
    });
    return (seeded, paths.Count);
}

// ---------------- git tree helpers ----------------

// Regular-file paths of the given commit. Identical paths are reflinked from
// the source; the final checkout repairs any whose source content differs.
List<string> TrackedFiles(string repoDir, string reference)
{
    string outText = GitOut(repoDir, "ls-tree", "-r", "-z", reference);
    var result = new List<string>();
    foreach (string rec in outText.Split('\0'))
    {
        if (rec.Length == 0)
            continue;
        int tab = rec.IndexOf('\t');
        if (tab < 0)
            continue;
        string[] fields = rec[..tab].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (fields.Length < 3)
            continue;
        string mode = fields[0];
        if (mode != "100644" && mode != "100755")
            continue;
        result.Add(rec[(tab + 1)..]);
    }
    return result;
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
            case "--source":
                o.SourcePath = NextArg(argv, ref i, a);
                break;
            case "-b" or "-B" or "--reason":
                o.ForwardFlags.Add(a);
                o.ForwardFlags.Add(NextArg(argv, ref i, a));
                break;
            case "--detach" or "-d" or "--force" or "-f" or "--lock":
                o.ForwardFlags.Add(a);
                break;
            case "--checkout" or "--no-checkout":
                throw new UsageException($"{a} is not allowed; this tool controls checkout timing");
            default:
                if (a.StartsWith('-'))
                    throw new UsageException(
                        $"unsupported option '{a}'; for advanced flags run 'git worktree add' directly");
                positional.Add(a);
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
  -b <branch>     create a new branch (forwarded to git worktree add)
  -B <branch>     create or reset a branch (forwarded)
  --detach, -d    detach HEAD in the new worktree (forwarded)
  --force, -f     force creation (forwarded)
  --lock          lock the new worktree (forwarded)
  --reason <s>    reason for --lock (forwarded)
  --source <dir>  worktree to reflink files from (default: current worktree)
  -v, --verbose   print per-phase timing and details
  -h, --help      show this help

Copy-on-write requires source and target on the same CoW-capable volume
(Windows ReFS/Dev Drive, Linux Btrfs/XFS/ZFS, macOS APFS). Without it the
tool still works and falls back to a regular checkout.
""");
}

// ---------------- types ----------------

sealed class Options
{
    public string? TargetPath;
    public string? CommitIsh;
    public string? SourcePath;
    public bool Verbose;
    public bool ShowHelp;
    public List<string> ForwardFlags = new();
}

sealed class UsageException(string message) : Exception(message);
