import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
let reviewedDatabase = null;
function getReviewStateDatabasePath() {
    const baseDirectory = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    const dataDirectory = join(baseDirectory, "GitHubCopilot", "extensions", "code-review");
    mkdirSync(dataDirectory, { recursive: true });
    return join(dataDirectory, "review-state.sqlite");
}
function getReviewedDatabase() {
    if (reviewedDatabase) {
        return reviewedDatabase;
    }
    reviewedDatabase = new DatabaseSync(getReviewStateDatabasePath());
    reviewedDatabase.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS reviewed_files (
            review_key TEXT NOT NULL,
            file_path TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            PRIMARY KEY (review_key, file_path)
        );
    `);
    const columns = reviewedDatabase.prepare("PRAGMA table_info(reviewed_files)").all();
    if (columns.some((column) => column.name === "commit_sha")) {
        reviewedDatabase.exec(`
            DROP TABLE IF EXISTS reviewed_files_commit_sha;
            ALTER TABLE reviewed_files RENAME TO reviewed_files_commit_sha;
            CREATE TABLE reviewed_files (
                review_key TEXT NOT NULL,
                file_path TEXT NOT NULL,
                reviewed_at TEXT NOT NULL,
                PRIMARY KEY (review_key, file_path)
            );
        `);
    }
    return reviewedDatabase;
}
export function getReviewedFiles(reviewKeysByFile) {
    const entries = Object.entries(reviewKeysByFile).filter((entry) => entry[1]);
    if (!entries.length) {
        return [];
    }
    const database = getReviewedDatabase();
    const query = database.prepare("SELECT 1 FROM reviewed_files WHERE review_key = ? AND file_path = ?");
    return entries
        .filter(([filePath, reviewKey]) => query.get(reviewKey, filePath))
        .map(([filePath]) => filePath);
}
export function setReviewedFiles(reviewKeysByFile, files, reviewed) {
    const entries = files
        .map((filePath) => [filePath, reviewKeysByFile[filePath]])
        .filter((entry) => typeof entry[1] === "string" && entry[1]);
    if (!entries.length) {
        return;
    }
    const database = getReviewedDatabase();
    const insert = database.prepare("INSERT OR REPLACE INTO reviewed_files (review_key, file_path, reviewed_at) VALUES (?, ?, ?)");
    const remove = database.prepare("DELETE FROM reviewed_files WHERE review_key = ? AND file_path = ?");
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
        for (const [filePath, reviewKey] of entries) {
            if (reviewed) {
                insert.run(reviewKey, filePath, now);
            }
            else {
                remove.run(reviewKey, filePath);
            }
        }
        database.exec("COMMIT");
    }
    catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}
