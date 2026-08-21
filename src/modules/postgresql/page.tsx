import { useEffect, useRef, useState } from "react";
import { FiTable } from "react-icons/fi";
import { toast } from "sonner";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { PostgresSidebar } from "@/modules/postgresql/components/PostgresSidebar";
import { PostgresStartPanel } from "@/modules/postgresql/components/PostgresStartPanel";
import { PostgresWorkbench } from "@/modules/postgresql/components/PostgresWorkbench";
import {
    getManagedPostgresStatus,
    inspectPostgres,
    runPostgresQuery,
    startManagedPostgres,
    stopManagedPostgres,
} from "@/modules/postgresql/services/postgresql.service";
import type {
    ManagedPostgresConnection,
    ManagedPostgresStatus,
    PostgresDatabase,
    PostgresQueryResult,
    PostgresSelection,
} from "@/modules/postgresql/types";
import { getErrorMessage } from "@/shared/services/native";

const INITIAL_SQL = "SELECT version();";

export function PostgreSqlPage() {
    const { settings } = useAppSettings();
    const { registerItems } = useGlobalSearch();
    const { project } = useProject();
    const [status, setStatus] = useState<ManagedPostgresStatus | null>(null);
    const [connection, setConnection] = useState<ManagedPostgresConnection | null>(null);
    const [database, setDatabase] = useState<PostgresDatabase | null>(null);
    const [selection, setSelection] = useState<PostgresSelection | null>(null);
    const [sql, setSql] = useState(INITIAL_SQL);
    const [result, setResult] = useState<PostgresQueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const connectionRef = useRef<ManagedPostgresConnection | null>(null);

    useEffect(() => {
        connectionRef.current = connection;
    }, [connection]);

    useEffect(() => {
        let cancelled = false;
        const previousConnection = connectionRef.current;
        connectionRef.current = null;
        setConnection(null);
        setDatabase(null);
        setSelection(null);
        setResult(null);
        setError(null);
        void (previousConnection ? stopManagedPostgres() : Promise.resolve())
            .then(getManagedPostgresStatus)
            .then((nextStatus) => {
                if (!cancelled) setStatus(nextStatus);
            })
            .catch((cause) => {
                if (!cancelled) setError(getErrorMessage(cause));
            });
        return () => {
            cancelled = true;
        };
    }, [project?.root]);

    useEffect(
        () => () => {
            if (connectionRef.current) void stopManagedPostgres();
        },
        [],
    );

    useEffect(() => {
        const items = (database?.schemas ?? []).flatMap((schema) =>
            schema.tables.map((table) => ({
                action: () => selectTable({ schema: schema.name, table: table.name }),
                description: `${database?.name ?? "nexora"} · ${table.columns.length} columnas`,
                group: "Tablas PostgreSQL",
                icon: FiTable,
                id: `postgresql-table-${schema.name}-${table.name}`,
                keywords: `${schema.name} ${table.name} ${table.columns.map((column) => column.name).join(" ")}`,
                title: `${schema.name}.${table.name}`,
                workspace: "postgresql" as const,
            })),
        );
        registerItems("postgresql-tables", items);
    }, [database, registerItems]);

    async function startServer() {
        if (!project) return;
        setIsLoading(true);
        setError(null);
        toast.loading("Iniciando PostgreSQL local", {
            description: "Preparando el clúster aislado del proyecto",
            id: "postgresql-runtime",
        });
        try {
            const nextConnection = await startManagedPostgres(project.root);
            connectionRef.current = nextConnection;
            setConnection(nextConnection);
            const inspected = await inspectPostgres(nextConnection.connectionId);
            setDatabase(inspected);
            setStatus(await getManagedPostgresStatus());
            toast.success("PostgreSQL local conectado", {
                description: `127.0.0.1:${nextConnection.port} · ${inspected.name}`,
                id: "postgresql-runtime",
            });
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo iniciar PostgreSQL", {
                description: message,
                id: "postgresql-runtime",
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function stopServer() {
        setIsLoading(true);
        try {
            await stopManagedPostgres();
            connectionRef.current = null;
            setConnection(null);
            setDatabase(null);
            setSelection(null);
            setResult(null);
            setStatus(await getManagedPostgresStatus());
            toast.success("PostgreSQL local detenido");
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo detener PostgreSQL", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function refreshSchema(showToast = true) {
        if (!connection) return;
        setIsLoading(true);
        setError(null);
        try {
            const inspected = await inspectPostgres(connection.connectionId);
            setDatabase(inspected);
            if (showToast) {
                const tableCount = inspected.schemas.reduce(
                    (count, schema) => count + schema.tables.length,
                    0,
                );
                toast.success("Esquema PostgreSQL actualizado", {
                    description: `${tableCount} tablas y vistas`,
                });
            }
        } catch (cause) {
            const message = getErrorMessage(cause);
            setError(message);
            toast.error("No se pudo actualizar PostgreSQL", { description: message });
        } finally {
            setIsLoading(false);
        }
    }

    async function execute(allowWrite = false) {
        if (!connection) return;
        setIsLoading(true);
        setError(null);
        try {
            const nextResult = await runPostgresQuery(connection.connectionId, sql, allowWrite);
            setResult(nextResult);
            toast.success(
                nextResult.readonly ? "Consulta PostgreSQL completada" : "PostgreSQL actualizado",
                {
                    description: nextResult.readonly
                        ? `${nextResult.rows.length} filas · ${Math.round(nextResult.durationMs)} ms`
                        : `${nextResult.affectedRows} filas afectadas`,
                    id: "postgresql-query",
                },
            );
            if (!nextResult.readonly) await refreshSchema(false);
        } catch (cause) {
            const message = getErrorMessage(cause);
            if (
                !allowWrite &&
                message.includes("requiere confirmación") &&
                (!settings.confirmDestructiveActions ||
                    window.confirm(
                        "La sentencia modificará PostgreSQL. ¿Quieres ejecutarla en el servidor local?",
                    ))
            ) {
                setIsLoading(false);
                await execute(true);
                return;
            }
            setError(message);
            toast.error("Error en PostgreSQL", { description: message, id: "postgresql-query" });
        } finally {
            setIsLoading(false);
        }
    }

    function selectTable(nextSelection: PostgresSelection) {
        setSelection(nextSelection);
        setSql(selectTableSql(nextSelection));
        setResult(null);
        setError(null);
    }

    if (!connection) {
        return (
            <section className="module-page postgresql-page">
                <PostgresStartPanel
                    error={error}
                    hasProject={Boolean(project)}
                    isLoading={isLoading}
                    onStart={startServer}
                    status={status}
                />
            </section>
        );
    }

    return (
        <section className="module-page postgresql-page">
            <PostgresSidebar
                connection={connection}
                database={database}
                isLoading={isLoading}
                onRefresh={() => refreshSchema()}
                onSelect={selectTable}
                onStop={stopServer}
                selection={selection}
            />
            <PostgresWorkbench
                error={error}
                isLoading={isLoading}
                onExecute={() => execute()}
                onSqlChange={(value) => {
                    setSql(value);
                    setError(null);
                }}
                result={result}
                selection={selection}
                sql={sql}
            />
        </section>
    );
}

function selectTableSql(selection: PostgresSelection) {
    return `SELECT *\nFROM ${quoteIdentifier(selection.schema)}.${quoteIdentifier(selection.table)}\nLIMIT 100;`;
}

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}
