export type DemoColumn = {
    name: string;
    primary?: boolean;
    type: string;
};

export type DemoTable = {
    columns: DemoColumn[];
    name: string;
    rows: number;
};

export const DEMO_TABLES: readonly DemoTable[] = [
    {
        name: "projects",
        rows: 4,
        columns: [
            { name: "id", type: "INTEGER", primary: true },
            { name: "name", type: "TEXT" },
            { name: "path", type: "TEXT" },
        ],
    },
    {
        name: "requests",
        rows: 12,
        columns: [
            { name: "id", type: "INTEGER", primary: true },
            { name: "method", type: "TEXT" },
            { name: "url", type: "TEXT" },
            { name: "status", type: "INTEGER" },
        ],
    },
    {
        name: "environments",
        rows: 3,
        columns: [
            { name: "id", type: "INTEGER", primary: true },
            { name: "name", type: "TEXT" },
            { name: "variables", type: "JSON" },
        ],
    },
] as const;

export const DEFAULT_SQL = `-- Consulta de muestra. No está conectada a un archivo real.
SELECT id, method, url, status
FROM requests
WHERE status >= 200
ORDER BY id DESC
LIMIT 20;`;
