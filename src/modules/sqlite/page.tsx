import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DatabaseTree } from "@/modules/sqlite/components/DatabaseTree";
import { SqlWorkbench } from "@/modules/sqlite/components/SqlWorkbench";
import { inspectSqlite, runSqliteQuery } from "@/modules/sqlite/services/sqlite.service";
import type { SqliteDatabase, SqliteQueryResult } from "@/modules/sqlite/types";
import { getErrorMessage } from "@/shared/services/native";

const INITIAL_SQL = "SELECT sqlite_version() AS version;";

export function SqlitePage() {
    const [database, setDatabase] = useState<SqliteDatabase | null>(null);
    const [selectedTable, setSelectedTable] = useState("");
    const [sql, setSql] = useState(INITIAL_SQL);
    const [result, setResult] = useState<SqliteQueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function openDatabase() {
        const path = await open({
            filters: [{ name: "SQLite", extensions: ["sqlite", "sqlite3", "db"] }],
            multiple: false,
            title: "Abrir base de datos SQLite",
        });
        if (typeof path !== "string") return;
        setIsLoading(true);
        setError(null);
        try {
            const inspected = await inspectSqlite(path);
            setDatabase(inspected);
            const firstTable = inspected.tables[0]?.name ?? "";
            setSelectedTable(firstTable);
            setSql(firstTable ? selectTableSql(firstTable) : INITIAL_SQL);
            setResult(null);
        } catch (cause) {
            setError(getErrorMessage(cause));
        } finally {
            setIsLoading(false);
        }
    }

    async function execute(allowWrite = false) {
        if (!database) return;
        setIsLoading(true);
        setError(null);
        try {
            setResult(await runSqliteQuery(database.path, sql, allowWrite));
        } catch (cause) {
            const message = getErrorMessage(cause);
            if (
                !allowWrite &&
                message.includes("requiere confirmación") &&
                window.confirm("La sentencia modificará la base de datos. ¿Quieres ejecutarla?")
            ) {
                setIsLoading(false);
                await execute(true);
                return;
            }
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }

    function selectTable(table: string) {
        setSelectedTable(table);
        setSql(selectTableSql(table));
        setResult(null);
        setError(null);
    }

    return (
        <section className="module-page sqlite-page">
            <DatabaseTree
                database={database}
                onOpen={openDatabase}
                onSelect={selectTable}
                selectedTable={selectedTable}
            />
            <SqlWorkbench
                error={error}
                hasDatabase={Boolean(database)}
                isLoading={isLoading}
                onExecute={() => execute()}
                onSqlChange={(value) => {
                    setSql(value);
                    setError(null);
                }}
                result={result}
                selectedTable={selectedTable}
                sql={sql}
            />
        </section>
    );
}

function selectTableSql(table: string) {
    return `SELECT *\nFROM "${table.replace(/"/g, '""')}"\nLIMIT 100;`;
}
