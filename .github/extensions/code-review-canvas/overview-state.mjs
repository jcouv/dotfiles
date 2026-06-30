import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml } from "./html.mjs";
function overviewRoot() {
    const base = process.env.LOCALAPPDATA || process.cwd();
    return join(base, "GitHubCopilot", "extensions", "code-review", "overview-requests");
}
function ensureOverviewRoot() {
    const root = overviewRoot();
    mkdirSync(root, { recursive: true });
    return root;
}
function requestPath(id) {
    return join(ensureOverviewRoot(), `${id}.json`);
}
function htmlPath(id) {
    return join(ensureOverviewRoot(), `${id}.html`);
}
function safeReadJson(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
function shortSha(value) {
    return String(value || "").trim().slice(0, 12);
}
function overviewId(input) {
    const start = shortSha(input.normalizedBaseline);
    const end = shortSha(input.endSha);
    const worktreeFingerprint = shortSha(input.worktreeFingerprint);
    const worktreeSuffix = "includesWorktree" in input && input.includesWorktree
        ? `-worktree${worktreeFingerprint ? `-${worktreeFingerprint}` : ""}`
        : "";
    return start && end ? `${start}-${end}${worktreeSuffix}` : "";
}
function buildPrompt(request, id, htmlOutputPath) {
    const source = request.branch
        ? `PR or review target ${request.branch}`
        : `local checkout compared from ${request.baseline || request.normalizedBaseline || "the default baseline"}`;
    const fileList = request.files.slice(0, 200).map(file => `- ${file.status} ${file.path}`).join("\n");
    return [
        "Use the linear-walkthrough skill to summarize the full review target, ignoring the current Range selection.",
        "",
        "Create a reviewer-facing overview as a standalone HTML document.",
        "",
        "When the HTML is ready, call the Code Review canvas action with exactly this target:",
        `invoke_canvas_action({ instanceId: ${JSON.stringify(request.instanceId)}, actionName: "set_overview_html", input: { id: ${JSON.stringify(id)}, html } })`,
        "",
        "The extension will cache the HTML at:",
        htmlOutputPath,
        "",
        "Review source:",
        source,
        "",
        "Repository:",
        request.workingDirectory,
        "",
        "Baseline:",
        request.baseline || request.normalizedBaseline,
        "",
        "Resolved baseline:",
        request.normalizedBaseline,
        "",
        request.includesWorktree ? "Resolved head commit (plus worktree changes):" : "Resolved head:",
        request.endSha,
        request.includesWorktree ? "Worktree changes are included in the reviewed target." : "",
        request.includesWorktree && request.worktreeFingerprint ? `Worktree fingerprint: ${request.worktreeFingerprint}` : "",
        "",
        "Important requirements:",
        "- Summarize all changes in the loaded target, not only the selected Range.",
        "- Use the linear-walkthrough narrative style: reviewer brief first, then a coherent walkthrough, then supporting notes.",
        "- Cite real file paths and ground substantive claims in inspected evidence.",
        "- Produce HTML suitable for display inside the Code Review canvas main pane.",
        "- Keep everything private and local; do not post to GitHub.",
        "",
        "Changed files:",
        fileList || "(none)",
    ].join("\n");
}
export function createOverviewRequest(input) {
    const id = overviewId(input);
    if (!id) {
        throw new Error("Overview request requires resolved start and end SHAs.");
    }
    const outputHtmlPath = htmlPath(id);
    const request = {
        ...input,
        id,
        createdAt: new Date().toISOString(),
        requestPath: requestPath(id),
        htmlPath: outputHtmlPath,
        htmlUrl: `/overview-html?id=${encodeURIComponent(id)}`,
        prompt: buildPrompt(input, id, outputHtmlPath),
    };
    writeFileSync(request.requestPath, JSON.stringify(request, null, 2));
    return request;
}
export function getOverviewRequest(id) {
    const request = safeReadJson(requestPath(id));
    if (!request) {
        return null;
    }
    return {
        ...request,
        htmlReady: existsSync(request.htmlPath),
    };
}
export function listOverviewRequests(instanceId = "") {
    const root = ensureOverviewRoot();
    return readdirSync(root)
        .filter(name => name.endsWith(".json"))
        .map(name => safeReadJson(join(root, name)))
        .filter(Boolean)
        .filter(request => !instanceId || request.instanceId === instanceId)
        .map(request => ({
        ...request,
        htmlReady: existsSync(request.htmlPath),
    }))
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}
export function findOverviewRequest(input) {
    const id = overviewId(input);
    const request = id ? getOverviewRequest(id) : null;
    if (!request) {
        return null;
    }
    return request.workingDirectory === input.workingDirectory
        && request.normalizedBaseline === input.normalizedBaseline
        && request.endSha === input.endSha
        && Boolean(request.includesWorktree) === Boolean(input.includesWorktree)
        && (!input.includesWorktree || String(request.worktreeFingerprint || "") === String(input.worktreeFingerprint || ""))
        ? request
        : null;
}
export function setOverviewHtml(id, html) {
    const request = getOverviewRequest(id);
    if (!request) {
        throw new Error(`Overview request not found: ${id}`);
    }
    writeFileSync(request.htmlPath, String(html), "utf8");
    return getOverviewRequest(id);
}
export function renderOverviewHtml(id) {
    const request = getOverviewRequest(id);
    if (!request) {
        return {
            statusCode: 404,
            html: "<!doctype html><title>Overview not found</title><p>Overview request not found.</p>",
        };
    }
    if (request.htmlReady) {
        return {
            statusCode: 200,
            html: readFileSync(request.htmlPath, "utf8"),
        };
    }
    return {
        statusCode: 202,
        html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { color: #1f2328; font: 14px system-ui, sans-serif; margin: 1.5rem; line-height: 1.45; }
      pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; overflow: auto; padding: 1rem; white-space: pre-wrap; }
      @media (prefers-color-scheme: dark) {
        body { background: #0d1117; color: #f0f6fc; }
        pre { background: #161b22; border-color: #30363d; }
      }
    </style>
  </head>
  <body>
    <h1>Overview requested</h1>
    <p>An agent should process this request with the <code>linear-walkthrough</code> skill and write the generated HTML to:</p>
    <pre>${escapeHtml(request.htmlPath)}</pre>
    <h2>Agent prompt</h2>
    <pre>${escapeHtml(request.prompt)}</pre>
  </body>
</html>`,
    };
}
