# git-cow-worktree

A Copilot skill plus a file-based C# app for creating git worktrees. It behaves
like `git worktree add`, but when the target volume supports copy-on-write it
seeds the new worktree with reflink clones of an existing worktree, so unchanged
files share on-disk blocks instead of being copied (little disk space and I/O).
When CoW is unavailable it falls back to a regular checkout; the result is
identical either way.

## Layout

- `SKILL.md` — instructions for the agent: when to use it, how to run the app, guardrails.
- `app/git-cow-worktree.cs` — the file-based C# program.

## Requirements

- The `.NET` SDK (`dotnet`) and the **`net10.0` runtime**. The app pins itself to
  `net10.0` via a `#:property` directive because the CoW native interop in the
  `CopyOnWrite` library is not yet compatible with the .NET 11 preview runtime.
- `git` on `PATH`.
- For actual disk savings, a CoW-capable volume shared by source and target:
  Windows ReFS/Dev Drive, Linux Btrfs/XFS/ZFS, or macOS APFS. Without it the
  tool still works but falls back to a plain checkout.

## Usage

The intended entry point is the Copilot skill — just ask, e.g.:

> Create a worktree for branch `feature` at `..\myrepo-feature`

To run the app directly, see its built-in help:

```powershell
dotnet run app\git-cow-worktree.cs -- --help
```

## Notes / limitations

- Correctness never depends on CoW: the final `git checkout -f HEAD` makes the
  result identical to a normal `git worktree add`.
- Sparse-checkout repositories are not specially handled; the final checkout
  still produces a correct working tree, but seeding may reflink files that
  sparse rules would later remove.

## Credit

The approach — `git worktree add --no-checkout`, seed tracked files via
reflink from a similar worktree, then let `git checkout` finish — is adapted
from Josh Bleecher Snyder's
[`josharian/git-cow-worktree`](https://github.com/josharian/git-cow-worktree)
and the blog post
[Git CoW worktrees](https://commaok.xyz/post/git-cow-worktrees/). This is an
independent C# reimplementation of that idea.

Background on copy-on-write for developer workloads on Windows:
[Dev Drive and copy-on-write for developer performance](https://devblogs.microsoft.com/engineering-at-microsoft/dev-drive-and-copy-on-write-for-developer-performance/).

The Windows reflink (block clone) detection and cloning use Microsoft's
[`CopyOnWrite`](https://github.com/microsoft/CopyOnWrite) library.
