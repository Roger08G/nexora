export type SqliteColumn = {
    dataType: string;
    name: string;
    nullable: boolean;
    primaryKey: boolean;
};

export type SqliteTable = {
    columns: SqliteColumn[];
    name: string;
};

export type SqliteDatabase = {
    name: string;
    path: string;
    tables: SqliteTable[];
};

export type SqliteQueryResult = {
    affectedRows: number;
    columns: string[];
    durationMs: number;
    readonly: boolean;
    rows: Record<string, unknown>[];
    truncated: boolean;
};
