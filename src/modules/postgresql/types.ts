export type ManagedPostgresConnection = {
    connectionId: string;
    dataPath: string;
    database: string;
    port: number;
    username: string;
    version: string;
};

export type ManagedPostgresStatus = {
    active: boolean;
    available: boolean;
    connectionId: string | null;
    dataPath: string | null;
    database: string | null;
    port: number | null;
    projectRoot: string | null;
    runtimePath: string | null;
    username: string | null;
    version: string | null;
};

export type PostgresColumn = {
    dataType: string;
    name: string;
    nullable: boolean;
    primaryKey: boolean;
};

export type PostgresTable = {
    columns: PostgresColumn[];
    kind: string;
    name: string;
};

export type PostgresSchema = {
    name: string;
    tables: PostgresTable[];
};

export type PostgresDatabase = {
    name: string;
    schemas: PostgresSchema[];
    serverVersion: string;
};

export type PostgresQueryResult = {
    affectedRows: number;
    columns: string[];
    durationMs: number;
    readonly: boolean;
    rows: Record<string, unknown>[];
    truncated: boolean;
};

export type PostgresSelection = {
    schema: string;
    table: string;
};
