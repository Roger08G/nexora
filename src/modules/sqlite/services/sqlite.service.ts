import type { SqliteDatabase, SqliteQueryResult } from "@/modules/sqlite/types";
import { runCommand } from "@/shared/services/native";

export function inspectSqlite(path: string) {
    return runCommand<SqliteDatabase>("inspect_sqlite", { path });
}

export function runSqliteQuery(path: string, sql: string, allowWrite: boolean) {
    return runCommand<SqliteQueryResult>("execute_sqlite", {
        allowWrite,
        path,
        rowLimit: 500,
        sql,
    });
}
