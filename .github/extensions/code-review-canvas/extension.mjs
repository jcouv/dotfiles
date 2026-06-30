// Extension: code-review-canvas
// A code review canvas extension
//
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";
import { getReviewEntries, getWorkingDirectoryFromContext } from "./git.mjs";
import { listOverviewRequests, setOverviewHtml } from "./overview-state.mjs";
import { notifyAllServersStopping, notifyServerStopping, startServer } from "./server.mjs";
import { openInputs, selections, servers, workingDirectories, workingDirectoryStorage } from "./state.mjs";
let session;
const overviewGenerationRequests = new Map();
const overviewGenerationTimeoutMs = 10 * 60 * 1000;
function clearOverviewGenerationRequest(id) {
    const timeout = overviewGenerationRequests.get(id);
    if (timeout) {
        clearTimeout(timeout);
        overviewGenerationRequests.delete(id);
    }
}
async function requestOverviewGeneration(overview) {
    if (!overview?.id || overview.htmlReady || overviewGenerationRequests.has(overview.id)) {
        return;
    }
    const timeout = setTimeout(() => {
        overviewGenerationRequests.delete(overview.id);
    }, overviewGenerationTimeoutMs);
    timeout.unref?.();
    overviewGenerationRequests.set(overview.id, timeout);
    try {
        await session.send({
            prompt: [
                "Generate the Code Review canvas overview for the pending request below.",
                "",
                "Important:",
                "- Use the linear-walkthrough skill from the dotfiles repo if available (`C:\\repos\\dotfiles\\copilot\\skills\\linear-walkthrough`); otherwise follow the same style.",
                "- Inspect the repository as needed. Do not rely only on the file list.",
                "- Produce a standalone HTML document suitable for the canvas main pane.",
                "- Do not ask the user to copy/paste anything.",
                "- When done, call the Code Review canvas action set_overview_html exactly as instructed in the request prompt.",
                "",
                overview.prompt,
            ].join("\n"),
        });
    }
    catch (error) {
        clearOverviewGenerationRequest(overview.id);
        await session.log(`Failed to request overview generation for ${overview.id}: ${error?.message || String(error)}`, { level: "error" });
    }
}
session = await joinSession({
    canvases: [
        createCanvas({
            id: "code-review",
            displayName: "Code Review",
            description: "Lists the current worktree and recent commits for code review.",
            inputSchema: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    branch: { type: "string" },
                    baseline: { type: "string" },
                    range: { type: "string" },
                },
            },
            actions: [
                {
                    name: "get_review_entries",
                    description: "Returns the current worktree entry and latest commit entries.",
                    handler: async (ctx) => {
                        const workingDirectory = getWorkingDirectoryFromContext(ctx);
                        workingDirectories.set(ctx.instanceId, workingDirectory);
                        return workingDirectoryStorage.run(workingDirectory, async () => ({
                            entries: await getReviewEntries(),
                            instanceId: ctx.instanceId,
                        }));
                    },
                },
                {
                    name: "get_ui_selection",
                    description: "Returns the latest UI section selected in inspect mode.",
                    handler: async (ctx) => {
                        return {
                            selection: selections.get(ctx.instanceId) || null,
                            instanceId: ctx.instanceId,
                        };
                    },
                },
                {
                    name: "get_overview_requests",
                    description: "Returns overview requests created by the canvas Overview control.",
                    handler: async (ctx) => {
                        return {
                            requests: listOverviewRequests(ctx.instanceId),
                            instanceId: ctx.instanceId,
                        };
                    },
                },
                {
                    name: "set_overview_html",
                    description: "Stores generated overview HTML for a canvas overview request.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            html: { type: "string" },
                        },
                        required: ["id", "html"],
                    },
                    handler: async (ctx) => {
                        const input = ctx.input || ctx.arguments || {};
                        const overview = setOverviewHtml(input.id, input.html);
                        clearOverviewGenerationRequest(input.id);
                        return {
                            overview,
                            instanceId: ctx.instanceId,
                        };
                    },
                },
            ],
            open: async (ctx) => {
                workingDirectories.set(ctx.instanceId, getWorkingDirectoryFromContext(ctx));
                openInputs.set(ctx.instanceId, ctx.input || {});
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId, { requestOverviewGeneration });
                    servers.set(ctx.instanceId, entry);
                }
                return {
                    title: "Code Review",
                    url: entry.url,
                };
            },
            onClose: async (ctx) => {
                openInputs.delete(ctx.instanceId);
                workingDirectories.delete(ctx.instanceId);
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    notifyServerStopping(ctx.instanceId, "canvas-closed");
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
let processShutdownStarted = false;
function handleProcessShutdown(reason) {
    if (processShutdownStarted) {
        return;
    }
    processShutdownStarted = true;
    notifyAllServersStopping(reason);
    setTimeout(() => process.exit(0), 50).unref();
}
process.once("SIGTERM", () => handleProcessShutdown("SIGTERM"));
process.once("SIGINT", () => handleProcessShutdown("SIGINT"));
process.once("SIGHUP", () => handleProcessShutdown("SIGHUP"));
