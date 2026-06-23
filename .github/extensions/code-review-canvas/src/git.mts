import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fullFileDiffContext, workingDirectoryStorage } from "./state.mjs";
import { getReviewedFiles } from "./review-state.mjs";
import type { ChangedFile, DiffOptions, DiffRange, ErrorContext } from "./types.mjs";

const rangeFilesCache = new Map<string, ChangedFile[]>();
const rangeFileMetadataCache = new Map<string, { files: ChangedFile[]; reviewCommitSha: string; reviewKeysByFile: Record<string, string> }>();
const execFileAsync = promisify(execFile);
const gitMaxBuffer = 32 * 1024 * 1024;
const maxRangeFilesCacheEntries = 50;
const maxRangeFileMetadataCacheEntries = 50;
const maxUntrackedFingerprintBytes = 8 * 1024 * 1024;
export function getWorkingDirectoryFromContext(ctx) {
    const workingDirectory = ctx.session?.workingDirectory;
    if (typeof workingDirectory === "string" && workingDirectory.trim()) {
        return resolve(workingDirectory);
    }

    return process.cwd();
}

export function resolveWholeDiffRange(baseline, branch, entries) {
    return {
        base: baseline,
        head: branch.ref,
        includesWorktree: false,
        reviewRef: branch.ref,
        selectedIds: entries
            .filter((entry) => entry.kind === "commit")
            .map((entry) => entry.id),
    };
}
export function getWorkingDirectory() {
    return workingDirectoryStorage.getStore() || process.cwd();
}
export async function runGit(args) {
    const workingDirectory = getWorkingDirectory();
    try {
        const { stdout } = await execFileAsync("git", ["-C", workingDirectory, ...args], {
            maxBuffer: gitMaxBuffer,
        });
        return stdout.trim();
    } catch (error) {
        error.command = `git -C ${workingDirectory} ${args.join(" ")}`;
        throw error;
    }
}

export async function runGitMaybe(args) {
    try {
        return await runGit(args);
    } catch (error) {
        return error.stdout?.trim() || "";
    }
}

export async function runGh(args) {
    const workingDirectory = getWorkingDirectory();
    try {
        const { stdout } = await execFileAsync("gh", args, {
            cwd: workingDirectory,
            maxBuffer: 1024 * 1024,
        });
        return stdout.trim();
    } catch (error) {
        error.command = `gh ${args.join(" ")}`;
        throw error;
    }
}

function parseGitHubRepository(remoteUrl) {
    const match = String(remoteUrl).trim().match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
    return match ? `${match[1]}/${match[2]}` : "";
}

export async function getPullRequestRemote() {
    const remotesOutput = await runGit(["remote"]);
    const remotes = remotesOutput ? remotesOutput.split(/\r?\n/).filter(Boolean) : [];
    const orderedRemotes = [
        ...["dotnet", "upstream", "origin"].filter(remote => remotes.includes(remote)),
        ...remotes.filter(remote => !["dotnet", "upstream", "origin"].includes(remote)),
    ];

    for (const remote of orderedRemotes) {
        const remoteUrl = await runGitMaybe(["remote", "get-url", remote]);
        const repository = parseGitHubRepository(remoteUrl);
        if (repository) {
            return { remote, repository };
        }
    }

    const repository = await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    return { remote: orderedRemotes[0] || "origin", repository };
}

export function formatErrorDetails(error, context: ErrorContext = {}) {
    const lines = [context.title || "Failed to load repository data"];
    if (context.request) {
        lines.push("", `Request: ${context.request}`);
    }
    if (error.command) {
        lines.push("", `Command: ${error.command}`);
    }
    if (typeof error.code !== "undefined") {
        lines.push(`Exit code: ${error.code}`);
    }
    if (error.message) {
        lines.push("", `Error: ${error.message}`);
    }
    if (error.stderr?.trim()) {
        lines.push("", "stderr:", error.stderr.trim());
    }
    if (error.stdout?.trim()) {
        lines.push("", "stdout:", error.stdout.trim());
    }
    return lines.join("\n");
}

export function parseStatusLine(line) {
    const status = line.slice(0, 2).trim();
    const path = line.slice(3);
    return { status, path };
}

export function parseNameStatusLine(line) {
    const [status, ...paths] = line.split("\t");
    const path = paths.at(-1);
    return path ? { status, path } : null;
}

export function uniqueFiles(files) {
    const seen = new Set();
    return files.filter((file) => {
        if (seen.has(file.path)) {
            return false;
        }
        seen.add(file.path);
        return true;
    });
}

export function isWorktreeToken(value) {
    return value.trim().toUpperCase() === "WORKTREE";
}

export function isNumericToken(value) {
    return /^\d+$/.test(value.trim());
}

export function parsePrNumber(value) {
    const match = value.trim().match(/^#?(\d+)$/);
    return match ? match[1] : "";
}

export function parseRemoteBranch(value) {
    const slash = value.indexOf("/");
    if (slash <= 0 || slash === value.length - 1) {
        return null;
    }
    return {
        remote: value.slice(0, slash),
        branch: value.slice(slash + 1),
    };
}

export async function getReviewEntries() {
    const [statusOutput, logOutput] = await Promise.all([
        runGit(["status", "--porcelain=v1"]),
        runGit(["log", "-n", "12", "--pretty=format:%H%x1f%h%x1f%an%x1f%ar%x1f%s"]),
    ]);

    const worktreeFiles = statusOutput ? statusOutput.split(/\r?\n/).map(parseStatusLine) : [];
    const worktree = {
        id: "worktree",
        kind: "worktree",
        title: "Worktree",
        subtitle: worktreeFiles.length
            ? `${worktreeFiles.length} uncommitted ${worktreeFiles.length === 1 ? "file" : "files"}`
            : "No uncommitted changes",
        meta: "Current checkout",
        files: worktreeFiles,
    };

    const commits = logOutput
        ? logOutput.split(/\r?\n/).map((line) => {
              const [sha, shortSha, author, age, subject] = line.split("\x1f");
              return {
                  id: sha,
                  kind: "commit",
                  title: subject,
                  subtitle: `${shortSha} by ${author} (${age})`,
                  meta: age,
                  files: [],
              };
          })
        : [];

    return [worktree, ...commits];
}

export function clampIndex(index, max) {
    if (!Number.isFinite(index)) {
        return 0;
    }
    return Math.max(0, Math.min(max, index));
}

export async function getDiffFiles(range: DiffRange, options: DiffOptions = {}) {
    const whitespaceArgs = options.ignoreWhitespace ? ["--ignore-all-space"] : [];
    const args = range.head
        ? ["diff", "--name-status", ...whitespaceArgs, range.base, range.head, "--"]
        : ["diff", "--name-status", ...whitespaceArgs, range.base, "--"];
    const diffOutput = await runGitMaybe(args);
    const files = diffOutput
        ? diffOutput.split(/\r?\n/).map(parseNameStatusLine).filter(Boolean)
        : [];

    if (range.includesWorktree) {
        const statusOutput = await runGit(["status", "--porcelain=v1"]);
        const untracked = statusOutput
            ? statusOutput
                  .split(/\r?\n/)
                  .map(parseStatusLine)
                  .filter((file) => file.status === "??")
            : [];
        for (const file of untracked) {
            if (file.path.endsWith("/")) {
                const output = await runGitMaybe(["ls-files", "--others", "--exclude-standard", "--", file.path]);
                files.push(
                    ...output
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .map((path) => ({ status: "??", path })),
                );
            } else {
                files.push(file);
            }

        }
    }

    return uniqueFiles(files).sort((a, b) => a.path.localeCompare(b.path));
}

export function cloneFiles(files: ChangedFile[]) {
    return files.map((file) => ({ status: file.status, path: file.path }));
}

export function rangeFilesCacheKey(range: DiffRange, options: DiffOptions = {}) {
    if (range.includesWorktree) {
        return "";
    }

    return JSON.stringify({
        workingDirectory: getWorkingDirectory(),
        base: range.base,
        head: range.head || "",
        ignoreWhitespace: Boolean(options.ignoreWhitespace),
    });
}

export function getCachedRangeFiles(cacheKey: string) {
    const cached = rangeFilesCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    rangeFilesCache.delete(cacheKey);
    rangeFilesCache.set(cacheKey, cached);
    return cloneFiles(cached);
}

export function setCachedRangeFiles(cacheKey: string, files: ChangedFile[]) {
    rangeFilesCache.set(cacheKey, cloneFiles(files));
    while (rangeFilesCache.size > maxRangeFilesCacheEntries) {
        rangeFilesCache.delete(rangeFilesCache.keys().next().value);
    }
}

export async function getRangeFiles(range: DiffRange, options: DiffOptions = {}) {
    const cacheKey = rangeFilesCacheKey(range, options);
    if (cacheKey) {
        const cached = getCachedRangeFiles(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const files = await getDiffFiles(range, options);
    if (cacheKey) {
        setCachedRangeFiles(cacheKey, files);
    }

    return files;
}

export function cloneReviewKeysByFile(reviewKeysByFile: Record<string, string>) {
    return Object.fromEntries(Object.entries(reviewKeysByFile));
}

export async function getRangeFileMetadataCacheInfo(range: DiffRange, options: DiffOptions = {}) {
    if (range.includesWorktree) {
        return null;
    }

    const [baseCommitSha, headCommitSha, reviewCommitSha] = await Promise.all([
        runGit(["rev-parse", "--verify", `${range.base}^{commit}`]),
        range.head ? runGit(["rev-parse", "--verify", `${range.head}^{commit}`]) : Promise.resolve(""),
        getReviewCommitSha(range),
    ]);
    return {
        cacheKey: JSON.stringify({
            workingDirectory: getWorkingDirectory(),
            baseCommitSha,
            headCommitSha,
            reviewCommitSha,
            ignoreWhitespace: Boolean(options.ignoreWhitespace),
        }),
        reviewCommitSha,
    };
}

export function getCachedRangeFileMetadata(cacheKey: string) {
    const cached = rangeFileMetadataCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    rangeFileMetadataCache.delete(cacheKey);
    rangeFileMetadataCache.set(cacheKey, cached);
    return {
        files: cloneFiles(cached.files),
        reviewCommitSha: cached.reviewCommitSha,
        reviewKeysByFile: cloneReviewKeysByFile(cached.reviewKeysByFile),
    };
}

export function setCachedRangeFileMetadata(cacheKey: string, metadata: { files: ChangedFile[]; reviewCommitSha: string; reviewKeysByFile: Record<string, string> }) {
    rangeFileMetadataCache.set(cacheKey, {
        files: cloneFiles(metadata.files),
        reviewCommitSha: metadata.reviewCommitSha,
        reviewKeysByFile: cloneReviewKeysByFile(metadata.reviewKeysByFile),
    });
    while (rangeFileMetadataCache.size > maxRangeFileMetadataCacheEntries) {
        rangeFileMetadataCache.delete(rangeFileMetadataCache.keys().next().value);
    }
}

export async function getRangeFileMetadata(range: DiffRange, options: DiffOptions = {}) {
    const cacheInfo = await getRangeFileMetadataCacheInfo(range, options);
    if (cacheInfo) {
        const cached = getCachedRangeFileMetadata(cacheInfo.cacheKey);
        if (cached) {
            return cached;
        }
    }

    const files = await getRangeFiles(range, options);
    const reviewCommitSha = cacheInfo?.reviewCommitSha || await getReviewCommitSha(range);
    const reviewKeysByFile = await getReviewKeysByFile(reviewCommitSha, files);
    const metadata = { files, reviewCommitSha, reviewKeysByFile };
    if (cacheInfo) {
        setCachedRangeFileMetadata(cacheInfo.cacheKey, metadata);
    }

    return metadata;
}

export async function getCurrentBranch() {
    return runGitMaybe(["symbolic-ref", "--quiet", "--short", "HEAD"]);
}

export async function getDefaultBaseline(headRef = "HEAD") {
    const candidate = `${headRef}~8`;
    const resolved = await runGitMaybe(["rev-parse", "--verify", candidate]);
    return resolved ? candidate : headRef;
}

export async function getDefaultBranch() {
    const preferredRemote = await getPullRequestRemote();
    const remoteHead = await runGitMaybe(["symbolic-ref", "--quiet", "--short", `refs/remotes/${preferredRemote.remote}/HEAD`]);
    if (remoteHead.startsWith(`${preferredRemote.remote}/`)) {
        return remoteHead.slice(preferredRemote.remote.length + 1);
    }

    return remoteHead || "main";
}

export async function getMergeBaseBaseline(baseRef, headRef) {
    const mergeBase = await runGitMaybe(["merge-base", baseRef, headRef]);
    return mergeBase || await runGit(["rev-parse", baseRef]);
}

export async function getDefaultReviewBaseline(branch) {
    const remote = branch.remote || (await getPullRequestRemote()).remote;
    if (branch.baseRefName) {
        const baseRef = `refs/remotes/${remote}/${branch.baseRefName}`;
        await runGitMaybe(["fetch", remote, `${branch.baseRefName}:${baseRef}`]);
        return getMergeBaseBaseline(baseRef, branch.ref);
    }

    if (branch.ref === "HEAD") {
        return runGit(["rev-parse", await getDefaultBaseline("HEAD")]);
    }

    const defaultBranch = await getDefaultBranch();
    const baseRef = `refs/remotes/${remote}/${defaultBranch}`;
    await runGitMaybe(["fetch", remote, `${defaultBranch}:${baseRef}`]);
    return getMergeBaseBaseline(baseRef, branch.ref);
}

export async function isCurrentHeadRef(ref) {
    const [refSha, headSha] = await Promise.all([
        runGitMaybe(["rev-parse", "--verify", ref]),
        runGit(["rev-parse", "--verify", "HEAD"]),
    ]);
    return Boolean(refSha) && refSha === headSha;
}

export async function ensureReviewBranch(branchText) {
    const branch = branchText.trim();
    if (!branch) {
        return { branch: "", ref: "HEAD", fetched: false, includeWorktree: true };
    }

    const prNumber = parsePrNumber(branch);
    if (prNumber) {
        const prRemote = await getPullRequestRemote();
        const prJson = await runGh(["pr", "view", prNumber, "--repo", prRemote.repository, "--json", "baseRefName,headRefName"]);
        const pr = JSON.parse(prJson);
        const prBranch = pr.headRefName;
        if (!prBranch) {
            throw new Error(`Could not resolve head branch for PR #${prNumber}.`);
        }

        const prRef = `refs/remotes/${prRemote.remote}/pr/${prNumber}`;
        await runGit(["fetch", prRemote.remote, `pull/${prNumber}/head:${prRef}`]);
        await runGit(["rev-parse", "--verify", `${prRef}^{commit}`]);
        return {
            branch,
            remote: prRemote.remote,
            headBranch: prBranch,
            ref: prRef,
            fetched: true,
            baseRefName: pr.baseRefName || "",
            includeWorktree: await isCurrentHeadRef(prRef),
        };
    }

    await runGit(["check-ref-format", "--branch", branch]);
    if (branch.startsWith("-")) {
        throw new Error(`Invalid branch name: ${branch}`);
    }

    const localBranchRef = `refs/heads/${branch}`;
    const localRef = await runGitMaybe(["rev-parse", "--verify", `${localBranchRef}^{commit}`]);
    if (localRef) {
        return {
            branch,
            ref: localBranchRef,
            fetched: false,
            includeWorktree: await isCurrentHeadRef(localBranchRef),
        };
    }

    const remoteBranch = parseRemoteBranch(branch);
    if (!remoteBranch) {
        throw new Error(`Branch '${branch}' was not found locally. Use <remote>/<branch> to fetch a remote branch.`);
    }

    const remoteRef = `${remoteBranch.remote}/${remoteBranch.branch}`;
    const remoteUrl = await runGitMaybe(["remote", "get-url", remoteBranch.remote]);
    if (!remoteUrl) {
        throw new Error(`Remote '${remoteBranch.remote}' was not found. Add that remote locally or use a configured remote name.`);
    }
    await runGit(["fetch", remoteBranch.remote, `${remoteBranch.branch}:refs/remotes/${remoteRef}`]);
    await runGit(["rev-parse", "--verify", `${remoteRef}^{commit}`]);
    return {
        branch,
        remote: remoteBranch.remote,
        ref: remoteRef,
        fetched: true,
        includeWorktree: await isCurrentHeadRef(remoteRef),
    };
}

export async function checkoutPullRequest(prText) {
    const prNumber = parsePrNumber(prText);
    if (!prNumber) {
        throw new Error("Enter a PR number to checkout.");
    }

    const prRemote = await getPullRequestRemote();
    const prJson = await runGh(["pr", "view", prNumber, "--repo", prRemote.repository, "--json", "baseRefName,headRefName"]);
    const pr = JSON.parse(prJson);
    await runGh(["pr", "checkout", prNumber, "--repo", prRemote.repository]);
    const branchName = await getCurrentBranch();
    const branch = {
        branch: branchName,
        ref: "HEAD",
        fetched: false,
        includeWorktree: true,
        baseRefName: pr.baseRefName || "",
    };
    const baseline = await getDefaultReviewBaseline(branch);
    return {
        prNumber,
        branch: branchName,
        headBranch: pr.headRefName || "",
        baseline,
    };
}

export async function getSeriesEntries(baseline, headRef = "HEAD", includeWorktree = true) {
    const [statusOutput, logOutput] = await Promise.all([
        includeWorktree ? runGit(["status", "--porcelain=v1"]) : Promise.resolve(""),
        runGitMaybe(["log", "--reverse", "--pretty=format:%H%x1f%h%x1f%an%x1f%ar%x1f%s", `${baseline}..${headRef}`]),
    ]);

    const commits = logOutput
        ? logOutput.split(/\r?\n/).filter(Boolean).map((line, index) => {
              const [sha, shortSha, author, age, subject] = line.split("\x1f");
              return {
                  id: sha,
                  index,
                  kind: "commit",
                  title: subject,
                  subtitle: `${shortSha} by ${author} (${age})`,
              };
          })
        : [];

    const worktreeFiles = statusOutput ? statusOutput.split(/\r?\n/).map(parseStatusLine) : [];
    const hasWorktree = worktreeFiles.length > 0;
    return hasWorktree
        ? [
              ...commits,
              {
                  id: "WORKTREE",
                  index: null,
                  kind: "worktree",
                  title: "Worktree",
                  subtitle: worktreeFiles.length
                      ? `${worktreeFiles.length} uncommitted ${worktreeFiles.length === 1 ? "file" : "files"}`
                      : "No uncommitted changes",
              },
          ]
        : commits;
}

export function defaultRangeForEntries(entries) {
    const commitCount = entries.filter((entry) => entry.kind === "commit").length;
    const hasWorktree = entries.some((entry) => entry.kind === "worktree");
    if (commitCount > 0 && hasWorktree) {
        return "1..WORKTREE";
    }
    if (commitCount > 0) {
        return `1..${commitCount}`;
    }
    return hasWorktree ? "WORKTREE..WORKTREE" : "HEAD..HEAD";
}

export function parseRangeSyntax(rangeText) {
    const parts = rangeText.trim().split("..");
    if (parts.length === 1 && parts[0]) {
        return [parts[0].trim(), parts[0].trim()];
    }
    if (parts.length === 2 && parts[0] && !parts[1]) {
        return [parts[0].trim(), "WORKTREE"];
    }
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`Range must use A or A..B syntax: ${rangeText}`);
    }
    return parts.map((part) => part.trim());
}

export function resolveRangeEndpoint(token, commits) {
    if (isWorktreeToken(token)) {
        return { kind: "worktree", token: "WORKTREE" };
    }
    if (isNumericToken(token)) {
        const number = Number(token);
        const index = number - 1;
        const commit = commits[index];
        if (!commit) {
            throw new Error(`Commit number ${number} is outside the baseline range.`);
        }
        return { kind: "index", token, index, ref: commit.id };
    }
    return { kind: "ref", token, ref: token };
}

export function previousRefForIndex(index, commits, baseline) {
    return index === 0 ? baseline : commits[index - 1].id;
}

export function resolveDiffRangeFromText(baseline, rangeText, entries) {
    const commits = entries.filter((entry) => entry.kind === "commit");
    const [leftToken, rightToken] = parseRangeSyntax(rangeText);
    const left = resolveRangeEndpoint(leftToken, commits);
    const right = resolveRangeEndpoint(rightToken, commits);
    const selectedIds = new Set();

    let base;
    let head;
    let includesWorktree = false;

    if (left.kind === "index" && right.kind === "index") {
        const first = Math.min(left.index, right.index);
        const last = Math.max(left.index, right.index);
        base = previousRefForIndex(first, commits, baseline);
        head = commits[last].id;
        for (let index = first; index <= last; index++) {
            selectedIds.add(commits[index].id);
        }
    } else if (left.kind === "index" && right.kind === "worktree") {
        base = previousRefForIndex(left.index, commits, baseline);
        head = null;
        includesWorktree = true;
        for (let index = left.index; index < commits.length; index++) {
            selectedIds.add(commits[index].id);
        }
        selectedIds.add("WORKTREE");
    } else if (left.kind === "worktree" && right.kind === "worktree") {
        base = "HEAD";
        head = null;
        includesWorktree = true;
        selectedIds.add("WORKTREE");
    } else {
        base = left.kind === "index" ? previousRefForIndex(left.index, commits, baseline) : left.ref;
        head = right.kind === "worktree" ? null : right.ref;
        includesWorktree = right.kind === "worktree";
        if (left.kind === "index") {
            selectedIds.add(left.ref);
        }
        if (right.kind === "index") {
            selectedIds.add(right.ref);
        }
        if (right.kind === "worktree") {
            selectedIds.add("WORKTREE");
        }
    }

    return {
        base,
        head,
        includesWorktree,
        reviewRef: head || "HEAD",
        selectedIds: [...selectedIds],
    };
}

export function resolveRepoPath(filePath) {
    const workingDirectory = getWorkingDirectory();
    const resolved = resolve(workingDirectory, filePath);
    if (!resolved.startsWith(workingDirectory)) {
        throw new Error(`Path is outside the repository: ${filePath}`);
    }
    return resolved;
}

export async function getUntrackedDiff(filePath) {
    const content = await readFile(resolveRepoPath(filePath), "utf8");
    const lines = content.split(/\r?\n/).map((line) => `+${line}`).join("\n");
    return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@
${lines}`;
}

export async function getFileDiff(range: DiffRange, file: string, options: DiffOptions = {}) {
    if (!file) {
        return "";
    }

    const files = options.files || await getDiffFiles(range, options);
    const changedFile = files.find((entry) => entry.path === file);
    if (changedFile?.status === "??") {
        return getUntrackedDiff(file);
    }

    const whitespaceArgs = options.ignoreWhitespace ? ["--ignore-all-space"] : [];
    const args = range.head
        ? ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", `--unified=${fullFileDiffContext}`, ...whitespaceArgs, range.base, range.head, "--", file]
        : ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", `--unified=${fullFileDiffContext}`, ...whitespaceArgs, range.base, "--", file];
    return runGitMaybe(args);
}

export async function getReviewCommitSha(range) {
    return runGit(["rev-parse", "--verify", `${range.reviewRef}^{commit}`]);
}

async function getWorktreeFingerprint() {
    const hash = createHash("sha256");
    for (const args of [
        ["status", "--porcelain=v1", "-z"],
        ["diff", "--binary", "HEAD", "--"],
    ]) {
        hash.update(args.join("\0"));
        hash.update("\0");
        hash.update(await runGitMaybe(args));
        hash.update("\0");
    }

    const changedTrackedFiles = (await runGitMaybe(["diff", "--name-only", "-z", "HEAD", "--"]))
        .split("\0")
        .filter(Boolean)
        .sort();
    for (const file of changedTrackedFiles) {
        await hashWorktreeFile(hash, "tracked", file);
    }

    const untrackedFiles = (await runGitMaybe(["ls-files", "--others", "--exclude-standard", "-z"]))
        .split("\0")
        .filter(Boolean)
        .sort();
    for (const file of untrackedFiles) {
        await hashWorktreeFile(hash, "untracked", file);
    }

    return hash.digest("hex");
}

async function hashWorktreeFile(hash, kind: string, file: string) {
    const fullPath = resolve(getWorkingDirectory(), file);
    hash.update(kind);
    hash.update("\0");
    hash.update(file);
    hash.update("\0");
    try {
        const fileStat = await stat(fullPath);
        hash.update(String(fileStat.size));
        hash.update("\0");
        if (fileStat.isFile() && fileStat.size <= maxUntrackedFingerprintBytes) {
            hash.update(await readFile(fullPath));
        } else {
            hash.update(String(fileStat.mtimeMs));
            hash.update("\0");
            hash.update("content-skipped");
        }
    } catch {
        hash.update("unreadable");
    }
    hash.update("\0");
}

export async function getReviewKeysByFile(reviewCommitSha, files) {
    const filePaths = files.map((file) => file.path);
    if (!reviewCommitSha || !filePaths.length) {
        return {};
    }

    const output = await runGitMaybe(["ls-tree", "-r", "-z", reviewCommitSha, "--", ...filePaths]);
    const keysByFile = {};
    if (output) {
        for (const entry of output.split("\0")) {
            if (!entry) {
                continue;
            }

            const tabIndex = entry.indexOf("\t");
            if (tabIndex < 0) {
                continue;
            }

            const metadata = entry.slice(0, tabIndex).split(" ");
            const blobSha = metadata[2];
            const filePath = entry.slice(tabIndex + 1);
            if (blobSha && filePath) {
                keysByFile[filePath] = `blob:${blobSha}`;
            }
        }
    }

    for (const file of files) {
        if (!keysByFile[file.path]) {
            keysByFile[file.path] = `${file.status === "D" ? "deleted" : "missing"}:${reviewCommitSha}:${file.path}`;
        }
    }

    return keysByFile;
}

export async function resolveRequestedRange(branchText, baseline, rangeText) {
    const branch = await ensureReviewBranch(branchText);
    const normalizedBaseline = baseline.trim()
        ? await runGit(["rev-parse", baseline])
        : await getDefaultReviewBaseline(branch);
    const entries = await getSeriesEntries(normalizedBaseline, branch.ref, branch.includeWorktree);
    if (rangeText.trim() && !branch.includeWorktree && isWorktreeToken(rangeText.split("..").at(-1) || rangeText)) {
        rangeText = defaultRangeForEntries(entries);
    }
    const range = rangeText.trim()
        ? resolveDiffRangeFromText(normalizedBaseline, rangeText, entries)
        : resolveWholeDiffRange(normalizedBaseline, branch, entries);

    return { branch, normalizedBaseline, entries, range, rangeText };
}

export async function getDiffData(branchText, baseline, rangeText, requestedFile, options = {}) {
    const { branch, normalizedBaseline, entries, range, rangeText: normalizedRangeText } = await resolveRequestedRange(branchText, baseline, rangeText);
    const files = await getRangeFiles(range, options);
    const endSha = await getReviewCommitSha(range);
    const worktreeFingerprint = range.includesWorktree ? await getWorktreeFingerprint() : "";
    const selectedFile = files.some((file) => file.path === requestedFile)
        ? requestedFile
        : "";

    return {
        baseline: normalizedBaseline,
        branch: branch.branch,
        headBranch: branch.headBranch || "",
        branchRef: branch.ref,
        branchFetched: branch.fetched,
        endSha,
        includesWorktree: range.includesWorktree,
        worktreeFingerprint,
        range: normalizedRangeText,
        entries,
        selectedIds: range.selectedIds,
        files,
        selectedFile,
    };
}

export async function getSelectedFileDiffData(branchText, baseline, rangeText, requestedFile, options = {}) {
    const { range } = await resolveRequestedRange(branchText, baseline, rangeText);
    const files = await getRangeFiles(range, options);
    const selectedFile = files.some((file) => file.path === requestedFile)
        ? requestedFile
        : files[0]?.path || "";
    const diff = await getFileDiff(range, selectedFile, { ...options, files });
    return { selectedFile, diff };
}

export async function getReviewedStateData(branchText, baseline, rangeText, options = {}) {
    const { range } = await resolveRequestedRange(branchText, baseline, rangeText);
    const { reviewCommitSha, reviewKeysByFile } = await getRangeFileMetadata(range, options);
    const reviewedFiles = getReviewedFiles(reviewKeysByFile);
    return { reviewCommitSha, reviewKeysByFile, reviewedFiles };
}
