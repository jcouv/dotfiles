import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { addLocalComment, listLocalComments } from "./comments-state.mjs";
import { eventClients, selections, serverId, stablePortBase, stablePortCount, workingDirectories, workingDirectoryStorage } from "./state.mjs";
import { checkoutPullRequest, formatErrorDetails, getDiffData, getReviewedStateData, getSelectedFileDiffData } from "./git.mjs";
import { createOverviewRequest, findOverviewRequest, getOverviewRequest, renderOverviewHtml } from "./overview-state.mjs";
import { setReviewedFiles } from "./review-state.mjs";
import { renderHtml } from "./render-html.mjs";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const publicScriptAssets = new Set(["client.mjs", "client-text.mjs"]);
export function stablePortForInstance(instanceId) {
    let hash = 0;
    for (const char of instanceId) {
        hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    }

    return stablePortBase + (hash % stablePortCount);
}

async function listenOnPort(server, port) {
    return new Promise<void>((resolve, reject) => {
        const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
        };
        const onListening = () => {
            server.off("error", onError);
            resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
    });
}

async function listenOnStablePort(server, instanceId) {
    const stablePort = stablePortForInstance(instanceId);
    try {
        await listenOnPort(server, stablePort);
    } catch (error) {
        if (error.code !== "EADDRINUSE") {
            throw error;
        }

        await listenOnPort(server, 0);
    }
}

function getEventClients(instanceId) {
    let clients = eventClients.get(instanceId);
    if (!clients) {
        clients = new Set();
        eventClients.set(instanceId, clients);
    }

    return clients;
}

function sendServerEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readJsonBody(req) {
    let body = "";
    req.setEncoding("utf8");
    for await (const chunk of req) {
        body += chunk;
    }

    return body ? JSON.parse(body) : {};
}

function sendJson(res, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
}

function sendPlainText(res, statusCode, text) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(text);
}

function sendFormattedError(res, error, context = {}) {
    sendPlainText(res, 500, formatErrorDetails(error, context));
}

function sendScriptAsset(res, requestPath: string) {
    const scriptName = requestPath.slice(1);
    if (!publicScriptAssets.has(scriptName)) {
        sendPlainText(res, 404, "Script asset not found.");
        return;
    }

    const scriptPath = join(extensionRoot, scriptName);
    if (!existsSync(scriptPath)) {
        sendPlainText(res, 404, "Script asset not found.");
        return;
    }

    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(readFileSync(scriptPath, "utf8"));
}

export function notifyServerStopping(instanceId, reason = "server-stopping") {
    const clients = eventClients.get(instanceId);
    if (!clients) {
        return;
    }

    for (const res of clients) {
        try {
            sendServerEvent(res, "server-stopping", { reason, serverId });
            res.end();
        } catch (error) {
            console.error("Failed to notify code-review canvas client about shutdown.", error);
        }
    }
    eventClients.delete(instanceId);
}

export function notifyAllServersStopping(reason) {
    for (const instanceId of eventClients.keys()) {
        notifyServerStopping(instanceId, reason);
    }
}

export async function startServer(instanceId, options: { requestOverviewGeneration?: (overview) => Promise<void> } = {}) {
    const server = createServer(async (req, res) => {
        const workingDirectory = workingDirectories.get(instanceId) || process.cwd();
        await workingDirectoryStorage.run(workingDirectory, async () => {
            try {
                const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
                if (req.method === "GET" && requestUrl.pathname === "/health") {
                    res.setHeader("Cache-Control", "no-store");
                    sendJson(res, { ok: true, serverId });
                    return;
                }

                if (req.method === "GET" && requestUrl.pathname.endsWith(".mjs")) {
                    sendScriptAsset(res, requestUrl.pathname);
                    return;
                }

                if (req.method === "GET" && requestUrl.pathname === "/events") {
                    res.writeHead(200, {
                        "Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-store",
                        "Connection": "keep-alive",
                    });
                    sendServerEvent(res, "ready", { serverId });
                    const clients = getEventClients(instanceId);
                    clients.add(res);
                    const heartbeat = setInterval(() => {
                        try {
                            sendServerEvent(res, "heartbeat", { serverId, now: Date.now() });
                        } catch (error) {
                            console.error("Failed to send code-review canvas heartbeat.", error);
                            clearInterval(heartbeat);
                            clients.delete(res);
                        }
                    }, 5000);
                    req.on("close", () => {
                        clearInterval(heartbeat);
                        clients.delete(res);
                        if (!clients.size) {
                            eventClients.delete(instanceId);
                        }
                    });
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/ui-selection") {
                    const selection = await readJsonBody(req);
                    const selected = { ...selection, selectedAt: new Date().toISOString() };
                    selections.set(instanceId, selected);
                    sendJson(res, { ok: true });
                    return;
                }

                if (requestUrl.pathname === "/overview-request") {
                    if (req.method === "POST") {
                        try {
                            const request = await readJsonBody(req);
                            const branch = typeof request.branch === "string" ? request.branch : "";
                            const baseline = typeof request.baseline === "string" ? request.baseline : "";
                            const ignoreWhitespace = Boolean(request.ignoreWhitespace);
                            const data = await getDiffData(branch, baseline, "", "", { ignoreWhitespace });
                            const existingOverview = findOverviewRequest({
                                workingDirectory,
                                normalizedBaseline: data.baseline,
                                endSha: data.endSha,
                                includesWorktree: Boolean(data.includesWorktree),
                                worktreeFingerprint: data.worktreeFingerprint || "",
                            });
                            if (existingOverview) {
                                if (!existingOverview.htmlReady) {
                                    options.requestOverviewGeneration?.(existingOverview).catch(error => {
                                        console.error("Failed to request overview generation.", error);
                                    });
                                }
                                sendJson(res, { overview: existingOverview });
                                return;
                            }

                            const overviewRequest = createOverviewRequest({
                                instanceId,
                                workingDirectory,
                                branch,
                                baseline,
                                normalizedBaseline: data.baseline,
                                endSha: data.endSha,
                                includesWorktree: Boolean(data.includesWorktree),
                                worktreeFingerprint: data.worktreeFingerprint || "",
                                range: "",
                                targetLabel: typeof request.targetLabel === "string" ? request.targetLabel : "",
                                files: data.files || [],
                                entries: data.entries || [],
                            });
                            options.requestOverviewGeneration?.(overviewRequest).catch(error => {
                                console.error("Failed to request overview generation.", error);
                            });
                            sendJson(res, { overview: getOverviewRequest(overviewRequest.id) || overviewRequest });
                        } catch (error) {
                            sendFormattedError(res, error, {
                                title: "Failed to create overview request.",
                                request: `POST ${requestUrl.pathname}`,
                            });
                        }
                        return;
                    }

                    if (req.method === "GET") {
                        const id = requestUrl.searchParams.get("id") || "";
                        const overview = id ? getOverviewRequest(id) : null;
                        if (!overview) {
                            sendPlainText(res, 404, "Overview request not found.");
                            return;
                        }

                        sendJson(res, { overview });
                        return;
                    }
                }

                if (req.method === "GET" && requestUrl.pathname === "/overview-html") {
                    const id = requestUrl.searchParams.get("id") || "";
                    const overview = renderOverviewHtml(id);
                    res.statusCode = overview.statusCode;
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.setHeader("Cache-Control", "no-store");
                    res.end(overview.html);
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/checkout-pr") {
                    try {
                        const request = await readJsonBody(req);
                        const data = await checkoutPullRequest(request.prNumber || "");
                        sendJson(res, data);
                    } catch (error) {
                        sendFormattedError(res, error, {
                            title: "Failed to checkout PR.",
                            request: `POST ${requestUrl.pathname}`,
                        });
                    }
                    return;
                }

                if (req.method === "POST" && requestUrl.pathname === "/reviewed-files") {
                    try {
                        const request = await readJsonBody(req);
                        const reviewKeysByFile = request.reviewKeysByFile && typeof request.reviewKeysByFile === "object"
                            ? request.reviewKeysByFile
                            : {};
                        const files = Array.isArray(request.files)
                            ? request.files.filter((file) => typeof file === "string" && file)
                            : [];
                        const reviewed = Boolean(request.reviewed);
                        setReviewedFiles(reviewKeysByFile, files, reviewed);
                        sendJson(res, { ok: true });
                    } catch (error) {
                        sendFormattedError(res, error, {
                            title: "Failed to persist reviewed state.",
                            request: `POST ${requestUrl.pathname}`,
                        });
                    }
                    return;
                }

                if (requestUrl.pathname === "/local-comments") {
                    if (req.method === "GET") {
                        try {
                            const file = requestUrl.searchParams.get("file") || "";
                            const comments = listLocalComments(file);
                            sendJson(res, { comments });
                        } catch (error) {
                            sendFormattedError(res, error, {
                                title: "Failed to load local comments.",
                                request: `GET ${requestUrl.pathname}${requestUrl.search}`,
                            });
                        }
                        return;
                    }

                    if (req.method === "POST") {
                        try {
                            const request = await readJsonBody(req);
                            if (!request.filePath || !request.body) {
                                sendPlainText(res, 400, "Local comments require filePath and body.");
                                return;
                            }

                            const comment = addLocalComment(request);
                            sendJson(res, { comment });
                        } catch (error) {
                            sendFormattedError(res, error, {
                                title: "Failed to save local comment.",
                                request: `POST ${requestUrl.pathname}`,
                            });
                        }
                        return;
                    }
                }

                if (req.method === "GET" && requestUrl.pathname === "/diff-data") {
                    try {
                        const baseline = requestUrl.searchParams.get("baseline") || "";
                        const branch = requestUrl.searchParams.get("branch") || "";
                        const range = requestUrl.searchParams.has("range")
                            ? requestUrl.searchParams.get("range")
                            : "";
                        const file = requestUrl.searchParams.get("file") || "";
                        const ignoreWhitespace = requestUrl.searchParams.get("ignoreWhitespace") === "1";
                        const data = await getDiffData(branch, baseline, range, file, { ignoreWhitespace });
                        sendJson(res, data);
                    } catch (error) {
                        sendFormattedError(res, error, {
                            title: "Failed to load diff data.",
                            request: `GET ${requestUrl.pathname}${requestUrl.search}`,
                        });
                    }
                    return;
                }

                if (req.method === "GET" && requestUrl.pathname === "/file-diff") {
                    try {
                        const baseline = requestUrl.searchParams.get("baseline") || "";
                        const branch = requestUrl.searchParams.get("branch") || "";
                        const range = requestUrl.searchParams.has("range")
                            ? requestUrl.searchParams.get("range")
                            : "";
                        const file = requestUrl.searchParams.get("file") || "";
                        const ignoreWhitespace = requestUrl.searchParams.get("ignoreWhitespace") === "1";
                        const data = await getSelectedFileDiffData(branch, baseline, range, file, { ignoreWhitespace });
                        sendJson(res, data);
                    } catch (error) {
                        sendFormattedError(res, error, {
                            title: "Failed to load file diff.",
                            request: `GET ${requestUrl.pathname}${requestUrl.search}`,
                        });
                    }
                    return;
                }

                if (req.method === "GET" && requestUrl.pathname === "/reviewed-state") {
                    try {
                        const baseline = requestUrl.searchParams.get("baseline") || "";
                        const branch = requestUrl.searchParams.get("branch") || "";
                        const range = requestUrl.searchParams.has("range")
                            ? requestUrl.searchParams.get("range")
                            : "";
                        const ignoreWhitespace = requestUrl.searchParams.get("ignoreWhitespace") === "1";
                        const data = await getReviewedStateData(branch, baseline, range, { ignoreWhitespace });
                        sendJson(res, data);
                    } catch (error) {
                        sendFormattedError(res, error, {
                            title: "Failed to load reviewed state.",
                            request: `GET ${requestUrl.pathname}${requestUrl.search}`,
                        });
                    }
                    return;
                }

                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(await renderHtml(instanceId));
            } catch (error) {
                sendFormattedError(res, error);
            }
        });
    });
    await listenOnStablePort(server, instanceId);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}
