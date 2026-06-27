---
name: git-cow-worktree
description: "Create a git worktree, using copy-on-write reflinks when the volume supports it. Use whenever adding a git worktree."
user-invocable: true
---

# git-cow-worktree

Create a git worktree via a bundled file-based C# app. It behaves like
`git worktree add`, but on a copy-on-write volume (Windows ReFS/Dev Drive,
Linux Btrfs/XFS/ZFS, macOS APFS) it seeds the new worktree with reflink clones
of an existing worktree so unchanged files share on-disk blocks. Off a CoW
volume it does a regular checkout. The result is identical either way.

## Running It

Pass app args after `--`:

```powershell
dotnet run "<skill-dir>\app\git-cow-worktree.cs" -- <path> [<commit-ish>] [options]
```

`<skill-dir>` is this folder. Run with `--help` for all options; the common
ones are `-b <branch>` (new branch), `--source <dir>` (worktree to reflink
from, defaults to the current worktree), and `-v`. Only the handful of
`git worktree add` flags listed in `--help` are accepted; for anything else
use `git worktree add` directly.

The app pins itself to `net10.0`; that runtime plus `git` must be installed.

## Workflow

1. Resolve the repo (default cwd), worktree path, and branch/commit (use `-b` for a new branch).
2. Run the app.
3. Report where the worktree landed, the branch, and whether files were reflinked or it was a regular checkout.

## Guardrails

- Let `git worktree add` reject an existing path; never delete to make room.
- Never modify the source worktree; a dirty source is fine (`git checkout -f HEAD` fixes any mismatch).
- A regular (non-CoW) checkout is a correct result, not a failure.
