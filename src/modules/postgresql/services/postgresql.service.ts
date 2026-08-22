import type {
    ManagedPostgresConnection,
    ManagedPostgresStatus,
    PostgresDatabase,
    PostgresQueryResult,
} from "@/modules/postgresql/types";
import { runCommand } from "@/shared/services/native";

export function getManagedPostgresStatus() {
    return runCommand<ManagedPostgresStatus>("managed_postgresql_status");
}

export function startManagedPostgres(projectRoot: string) {
    return runCommand<ManagedPostgresConnection>("start_managed_postgresql", { projectRoot });
}

export function stopManagedPostgres() {
    return runCommand<void>("stop_managed_postgresql");
}

export function inspectPostgres(connectionId: string) {
    return runCommand<PostgresDatabase>("inspect_postgresql", { connectionId });
}

export function runPostgresQuery(connectionId: string, sql: string, allowWrite: boolean) {
    return runCommand<PostgresQueryResult>("execute_postgresql", {
        allowWrite,
        connectionId,
        rowLimit: 500,
        sql,
    });
}

export function exportPostgresCsv(
    path: string,
    columns: string[],
    rows: Record<string, unknown>[],
) {
    return runCommand<void>("export_postgresql_csv", {
        input: { columns, path, rows },
    });
}
