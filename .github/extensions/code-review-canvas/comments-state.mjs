import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { workingDirectoryStorage } from "./state.mjs";
let commentsDatabase = null;
function getCommentsDatabasePath() {
    const baseDirectory = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    const dataDirectory = join(baseDirectory, "GitHubCopilot", "extensions", "code-review");
    mkdirSync(dataDirectory, { recursive: true });
    return join(dataDirectory, "local-comments.sqlite");
}
function getWorkingDirectory() {
    return workingDirectoryStorage.getStore() || process.cwd();
}
function getCommentsDatabase() {
    if (commentsDatabase) {
        return commentsDatabase;
    }
    commentsDatabase = new DatabaseSync(getCommentsDatabasePath());
    commentsDatabase.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS local_comments (
            id TEXT PRIMARY KEY,
            working_directory TEXT NOT NULL,
            review_commit_sha TEXT NOT NULL,
            branch TEXT NOT NULL,
            baseline TEXT NOT NULL,
            range_text TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_key TEXT NOT NULL,
            line_number TEXT NOT NULL,
            line_side TEXT NOT NULL,
            code_line TEXT NOT NULL,
            selected_code TEXT NOT NULL,
            selection_start_line_key TEXT NOT NULL DEFAULT '',
            selection_end_line_key TEXT NOT NULL DEFAULT '',
            selection_start_line_number TEXT NOT NULL DEFAULT '',
            selection_end_line_number TEXT NOT NULL DEFAULT '',
            selection_start_column TEXT NOT NULL DEFAULT '',
            selection_end_column TEXT NOT NULL DEFAULT '',
            selection_start_line_side TEXT NOT NULL DEFAULT '',
            selection_end_line_side TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            status TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS local_comments_working_file
            ON local_comments (working_directory, file_path, created_at);
    `);
    const columns = commentsDatabase.prepare("PRAGMA table_info(local_comments)").all();
    const columnNames = new Set(columns.map((column) => column.name));
    for (const [name, definition] of [
        ["selection_start_line_key", "TEXT NOT NULL DEFAULT ''"],
        ["selection_end_line_key", "TEXT NOT NULL DEFAULT ''"],
        ["selection_start_line_number", "TEXT NOT NULL DEFAULT ''"],
        ["selection_end_line_number", "TEXT NOT NULL DEFAULT ''"],
        ["selection_start_column", "TEXT NOT NULL DEFAULT ''"],
        ["selection_end_column", "TEXT NOT NULL DEFAULT ''"],
        ["selection_start_line_side", "TEXT NOT NULL DEFAULT ''"],
        ["selection_end_line_side", "TEXT NOT NULL DEFAULT ''"],
    ]) {
        if (!columnNames.has(name)) {
            commentsDatabase.exec(`ALTER TABLE local_comments ADD COLUMN ${name} ${definition}`);
        }
    }
    return commentsDatabase;
}
function normalizeComment(row) {
    return {
        id: String(row.id || ""),
        reviewCommitSha: String(row.review_commit_sha || ""),
        branch: String(row.branch || ""),
        baseline: String(row.baseline || ""),
        rangeText: String(row.range_text || ""),
        filePath: String(row.file_path || ""),
        lineKey: String(row.line_key || ""),
        lineNumber: String(row.line_number || ""),
        lineSide: String(row.line_side || ""),
        codeLine: String(row.code_line || ""),
        selectedCode: String(row.selected_code || ""),
        selectionStartLineKey: String(row.selection_start_line_key || ""),
        selectionEndLineKey: String(row.selection_end_line_key || ""),
        selectionStartLineNumber: String(row.selection_start_line_number || ""),
        selectionEndLineNumber: String(row.selection_end_line_number || ""),
        selectionStartColumn: String(row.selection_start_column || ""),
        selectionEndColumn: String(row.selection_end_column || ""),
        selectionStartLineSide: String(row.selection_start_line_side || ""),
        selectionEndLineSide: String(row.selection_end_line_side || ""),
        body: String(row.body || ""),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
        status: String(row.status || "open"),
    };
}
export function listLocalComments(filePath = "") {
    const database = getCommentsDatabase();
    const workingDirectory = getWorkingDirectory();
    const rows = filePath
        ? database.prepare(`
            SELECT * FROM local_comments
            WHERE working_directory = ? AND file_path = ? AND status = 'open'
            ORDER BY created_at
        `).all(workingDirectory, filePath)
        : database.prepare(`
            SELECT * FROM local_comments
            WHERE working_directory = ? AND status = 'open'
            ORDER BY created_at
        `).all(workingDirectory);
    return rows.map((row) => normalizeComment(row));
}
export function addLocalComment(input) {
    const database = getCommentsDatabase();
    const now = new Date().toISOString();
    const comment = {
        id: randomUUID(),
        workingDirectory: getWorkingDirectory(),
        reviewCommitSha: input.reviewCommitSha || "",
        branch: input.branch || "",
        baseline: input.baseline || "",
        rangeText: input.rangeText || "",
        filePath: input.filePath || "",
        lineKey: input.lineKey || "",
        lineNumber: input.lineNumber || "",
        lineSide: input.lineSide || "",
        codeLine: input.codeLine || "",
        selectedCode: input.selectedCode || "",
        selectionStartLineKey: input.selectionStartLineKey || "",
        selectionEndLineKey: input.selectionEndLineKey || "",
        selectionStartLineNumber: input.selectionStartLineNumber || "",
        selectionEndLineNumber: input.selectionEndLineNumber || "",
        selectionStartColumn: input.selectionStartColumn || "",
        selectionEndColumn: input.selectionEndColumn || "",
        selectionStartLineSide: input.selectionStartLineSide || "",
        selectionEndLineSide: input.selectionEndLineSide || "",
        body: input.body || "",
        createdAt: now,
        updatedAt: now,
        status: "open",
    };
    database.prepare(`
        INSERT INTO local_comments (
            id,
            working_directory,
            review_commit_sha,
            branch,
            baseline,
            range_text,
            file_path,
            line_key,
            line_number,
            line_side,
            code_line,
            selected_code,
            selection_start_line_key,
            selection_end_line_key,
            selection_start_line_number,
            selection_end_line_number,
            selection_start_column,
            selection_end_column,
            selection_start_line_side,
            selection_end_line_side,
            body,
            created_at,
            updated_at,
            status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(comment.id, comment.workingDirectory, comment.reviewCommitSha, comment.branch, comment.baseline, comment.rangeText, comment.filePath, comment.lineKey, comment.lineNumber, comment.lineSide, comment.codeLine, comment.selectedCode, comment.selectionStartLineKey, comment.selectionEndLineKey, comment.selectionStartLineNumber, comment.selectionEndLineNumber, comment.selectionStartColumn, comment.selectionEndColumn, comment.selectionStartLineSide, comment.selectionEndLineSide, comment.body, comment.createdAt, comment.updatedAt, comment.status);
    return comment;
}
