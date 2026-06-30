# Code Review Canvas Design

## Overview

The `code-review-canvas` extension is a Copilot canvas extension that serves a local web UI for reviewing a git range. The extension process owns repository access and persistence; the canvas page owns interaction, rendering, cancellation, and incremental UI updates.

The design goal is to keep selection and file-tree interactions responsive even when git operations or diff rendering are expensive.

General UI principle: when user input makes downstream information stale, clear that stale information immediately. If a pane can be populated quickly but takes longer to finalize, show partial content with an explicit loading indicator for the unfinished work.

## Runtime model

- The extension process starts an HTTP server for each canvas instance.
- The canvas page is loaded from that server.
- The server runs git and GitHub CLI commands in the Copilot session working directory, not in the extension source directory.
- Each canvas instance gets a stable preferred local port derived from the instance id, with a random fallback if that port is occupied.
- The page listens to a server-sent events lifecycle channel so it can show `Reconnecting...` when the extension process is about to shut down.

## Source layout

TypeScript files under `src/` are the source of truth:

- `src/extension.mts`: Copilot `joinSession` and canvas registration.
- `src/server.mts`: HTTP server, routes, lifecycle events, stable-port handling.
- `src/git.mts`: git/GitHub CLI operations, range resolution, file metadata, diff data.
- `src/review-state.mts`: SQLite persistence for reviewed files.
- `src/comments-state.mts`: SQLite persistence for local review comments.
- `src/overview-state.mts`: local Overview request metadata and generated HTML storage.
- `src/render-html.mts`: HTML shell template and initial client bootstrap.
- `src/html.mts`: shared HTML escaping helpers.
- `src/styles.mts`: page-level CSS used by the HTML shell.
- `src/client.mts`: browser-side canvas behavior loaded as `/client.mjs`.
- `src/client-text.mts`: small browser-side text/path helpers used by the client entrypoint.
- `src/state.mts`: process-local maps shared across the extension modules.
- `src/types.mts`: shared TypeScript-only types.
- `src/client-globals.d.ts`: browser-only global declarations for the generated canvas bootstrap.

Copilot loads generated JavaScript. `npm run build` type-checks the TypeScript source, emits to `dist/`, then copies the generated `.mjs` runtime modules next to `extension.mjs`. `dist/` and `node_modules/` are local build artifacts and are not committed.

## Four-stage review model

The canvas works as a pipeline with four user-visible stages. Each stage should expose the next useful UI as soon as its own minimum data is available, without waiting for slower downstream stages.

### 1. Select what we are working on

The user chooses either:

- a pull request number,
- or the current local checkout.

Potentially expensive operations:

- `gh pr view` to resolve PR metadata,
- `gh pr checkout` when the user explicitly checks out a PR,
- `git fetch` when resolving remote PR refs,
- `git symbolic-ref`, `git rev-parse`, and `git merge-base` when resolving defaults.

Responsive/cancellable behavior:

- Editing target inputs does not run git and does not invalidate downstream stages. The currently loaded file tree and diff remain valid until the user presses Enter or clicks Load.
- Loading a new target cancels any pending range, reviewed-state, file-diff, and diff-render work.
- PR checkout is intentionally not implicit; it only runs from the Checkout button because it mutates the working tree.
- The local target does not accept a branch/ref; it always reviews whatever is currently checked out in the Copilot session working directory.

Caching:

- Target resolution is not persisted. It is cheap relative to correctness risk, and PR refs or the local checkout can move.

### 2. Select a range

The user chooses which commits/worktree state to review. The range checklist should update immediately on click or Ctrl+click, before any server request.

The Overview control above the Range field creates a target-wide overview request for the currently loaded PR or local checkout. It intentionally ignores the selected Range, queues an agent prompt in the foreground Copilot session to produce a private local HTML overview in the `linear-walkthrough` style, then opens the generated HTML document in the main pane once the agent writes it through the canvas action.

Potentially expensive operations:

- `git log` to build the commit checklist,
- `git status --porcelain` to detect worktree state,
- `git diff --name-status` to compute changed files for the range.

Responsive/cancellable behavior:

- Checklist selection is a local DOM update and does not wait for git.
- Changing range clears the stale file tree and stale diff immediately.
- Changing range preserves the selected file path for the new range request. If that file still exists in the new changed-file list, it remains selected; otherwise the server falls back to the first changed file.
- `/diff-data` returns only range metadata and changed files needed for the checklist and file tree.
- File tree rendering starts as soon as `/diff-data` returns.
- Reviewed status and selected file diff load after the file tree has had a chance to paint.
- The Files header shows a spinner until reviewed status is populated, because checkmarks are part of the finalized tree state.
- Changing the range cancels pending `/diff-data`, `/reviewed-state`, `/file-diff`, and diff rendering from older ranges.
- Overview requests use `/overview-request` and `/overview-html`; the `get_overview_requests` and `set_overview_html` canvas actions remain available for inspecting or replacing generated overview HTML.

Caching:

- The server keeps an in-memory range file-list cache for committed ranges, keyed by repository, range endpoints, and whitespace mode.
- Worktree ranges are not cached because uncommitted state changes frequently.
- The UI keeps an in-memory tree model cache keyed by file-list signature.
- Overview request metadata and generated HTML are stored under `%LOCALAPPDATA%\GitHubCopilot\extensions\code-review\overview-requests`. Committed-range overviews are keyed as `<start-sha-12>-<end-sha-12>.json` and `.html`, so the same resolved range can reuse the generated overview after a canvas/session restart. Worktree overviews include a worktree-content fingerprint in the key so uncommitted edits, staged edits, and untracked file content changes do not silently reuse stale HTML.
- Overview HTML is trusted local content by design. It is generated by the foreground Copilot agent for the current user and stored locally; it is not sanitized as untrusted web content.

### 3. Select a file

The user chooses a file or folder from the file tree.

Potentially expensive operations:

- `git diff --unified=<large>` for the selected file,
- reading an untracked file to synthesize an added-file patch.

Responsive/cancellable behavior:

- File-tree selection updates immediately in the DOM.
- Selecting a new file clears the stale diff immediately.
- Selecting a file calls `/file-diff`; it does not reload range metadata or rebuild the file tree.
- Selecting a different file cancels the previous `/file-diff` request and any pending diff render.
- Folder expand/collapse uses cached detached DOM where possible.

Caching:

- The selected-file diff itself is not currently cached. It is derived data and can be large.
- File-list and tree-model caches mean file selection does not repeat range-level work.

### 4. Look at the diff

The user reviews the selected file patch.

Potentially expensive operations:

- rich diff parser execution,
- rich diff DOM rendering,
- visible-whitespace transformation,
- navigation scans across rendered diff rows.

Responsive/cancellable behavior:

- Diff fetching is separated from range/file-tree loading.
- Diff rendering uses independent version checks so stale renders do not continue after a newer range or file selection.
- Valid file diffs should render through the rich diff UI. Raw patch text is not an acceptable steady-state file-diff display.
- If rich rendering fails, show an error status instead of falling back to raw patch text.

Caching:

- Rich rendered diff DOM is not cached today. It is the riskiest cache because display options such as whitespace mode, visible whitespace, layout, and side selection affect rendering.

## Data flow

Range loading is intentionally split into independent server/client phases:

1. Range metadata: resolve baseline/branch/range, compute the changed file list, and return commit checklist state.
2. File tree update: render the file tree as soon as the file list is available.
3. Reviewed state: load review keys and persisted reviewed status in the background.
4. File diff: fetch and render the selected file diff separately from range metadata.

This keeps the file tree independent from slower reviewed-state lookup and diff rendering. The most important responsiveness rule is: changing the range should not wait for review-key computation, SQLite lookups, file patch generation, or diff rendering.

## Server endpoints

- `GET /diff-data`: fast range metadata for the commit checklist and file tree. It does not load reviewed state or file patch text.
- `GET /reviewed-state`: background reviewed-state payload containing the right-side review keys and persisted reviewed files.
- `GET /file-diff`: selected file patch text for the current range.
- `POST /ui-selection`: remember the current UI selection for canvas actions.
- `POST /overview-request`: create or reuse a target-wide overview generation request.
- `GET /overview-request`: poll overview request metadata.
- `GET /overview-html`: load generated overview HTML, or the pending-status page before generation completes.
- `POST /reviewed-files`: persist reviewed/unreviewed state.
- `GET /local-comments`: load local comments, optionally scoped to a file.
- `POST /local-comments`: save a local comment with range, file, line, code, and selected-code context.
- `POST /checkout-pr`: checkout a pull request branch with `gh pr checkout`.
- `GET /events`: server-sent lifecycle events.
- `GET /health`: reconnect polling endpoint.
- Static scripts: only `client.mjs` and `client-text.mjs` are served; all other `.mjs` paths return 404.

## Caching

All performance caches are in memory and are safe to rebuild after extension reload.

| Cache | Location | Key | Contents | Invalidated by |
|---|---|---|---|---|
| Range file-list cache | Extension process | working directory + range endpoints + whitespace mode | changed file paths/statuses | extension reload, cache eviction, worktree ranges are skipped |
| Reviewed metadata cache | Extension process | resolved base/head/review commit SHAs + whitespace mode | review commit SHA and review keys by file | extension reload, cache eviction |
| Tree model cache | Canvas page | file-list signature | folder/file tree model | page reload, cache eviction |
| Folder DOM cache | Canvas page | folder path | detached child DOM for collapsed folders | file-tree rebuild, folder expansion |

Durable persistence is only used for user state: reviewed files and local comments are stored in SQLite under the user's local application data directory. Local comments are file-scoped and include best-effort line placement data so they can be shown inline when the file is opened from a different range.

## Cancellation and responsiveness

The UI uses separate version counters and abort controllers for:

- range metadata loading,
- reviewed-state loading,
- selected file diff loading,
- diff rendering.

Changing range or file selection invalidates older work. File tree updates are allowed to complete before reviewed state and diff rendering. Large diffs use a chunked raw renderer so the browser can yield between chunks and cancel stale rendering.

Operations that must not block file-tree updates:

- review-key computation with `git ls-tree`,
- SQLite reviewed-state lookup,
- selected-file `git diff`,
- rich diff parsing/rendering.

## Reviewed-state identity

Reviewed state is keyed by right-side file content when possible:

- Normal files use `blob:<blob-sha>`.
- Deleted or missing files use a commit-scoped fallback key.

This allows reviewed status to survive range changes when the file content did not change.
