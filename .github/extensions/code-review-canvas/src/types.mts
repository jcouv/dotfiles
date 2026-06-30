export type ChangedFile = {
    status: string;
    path: string;
};

export type DiffOptions = {
    ignoreWhitespace?: boolean;
    files?: ChangedFile[];
};

export type DiffRange = {
    base: string;
    head: string | null;
    includesWorktree: boolean;
    reviewRef: string;
    selectedIds: string[];
};

export type ErrorContext = {
    title?: string;
    request?: string;
};
