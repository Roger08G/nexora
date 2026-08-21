import { FiDownload, FiPlay } from "react-icons/fi";
import type { SqliteQueryResult } from "@/modules/sqlite/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type SqlWorkbenchProps = {
    error: string | null;
    hasDatabase: boolean;
    isLoading: boolean;
    onExecute: () => void;
    onSqlChange: (sql: string) => void;
    result: SqliteQueryResult | null;
    selectedTable: string;
    sql: string;
};

export function SqlWorkbench({
    error,
    hasDatabase,
    isLoading,
    onExecute,
    onSqlChange,
    result,
    selectedTable,
    sql,
}: SqlWorkbenchProps) {
    return (
        <div className="module-workbench">
            <header className="workspace-heading">
                <div>
                    <strong>Editor SQL</strong>
                    <small>·</small>
                    <span>{selectedTable || "sin tabla"}</span>
                </div>
                <StatusBadge tone={error ? "danger" : result ? "success" : "neutral"}>
                    {error ? "Error" : result ? `${result.durationMs} ms` : "Preparado"}
                </StatusBadge>
                <div className="workspace-heading__actions">
                    <ActionButton disabled icon={FiDownload} tone="ghost">
                        Exportar CSV
                    </ActionButton>
                    <ActionButton
                        disabled={!hasDatabase || isLoading}
                        icon={FiPlay}
                        onClick={onExecute}
                        tone="primary"
                    >
                        {isLoading ? "Ejecutando" : "Ejecutar"}
                    </ActionButton>
                </div>
            </header>
            <div className="sql-editor">
                <div className="sql-editor__gutter">
                    {sql.split("\n").map((_, index) => (
                        <span key={index}>{index + 1}</span>
                    ))}
                </div>
                <textarea
                    aria-label="Consulta SQL"
                    onChange={(event) => onSqlChange(event.target.value)}
                    spellCheck={false}
                    value={sql}
                />
            </div>
            <div className="panel-heading">
                <div className="panel-tabs">
                    <button data-active type="button">
                        Resultados
                    </button>
                    <button disabled type="button">
                        Estructura
                    </button>
                    <button disabled type="button">
                        Plan
                    </button>
                </div>
                <span className="panel-heading__context">{resultSummary(result, error)}</span>
            </div>
            <SqlResult error={error} hasDatabase={hasDatabase} result={result} />
        </div>
    );
}

function SqlResult({
    error,
    hasDatabase,
    result,
}: Pick<SqlWorkbenchProps, "error" | "hasDatabase" | "result">) {
    if (error) {
        return (
            <div className="result-empty result-empty--error">
                <FiPlay aria-hidden="true" />
                <h2>No se ha podido ejecutar la consulta</h2>
                <p>{error}</p>
            </div>
        );
    }
    if (result?.columns.length) {
        return (
            <div className="sql-results">
                <table>
                    <thead>
                        <tr>
                            {result.columns.map((column) => (
                                <th key={column}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.rows.map((row, index) => (
                            <tr key={index}>
                                {result.columns.map((column) => (
                                    <td key={column}>{formatCell(row[column])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (result && !result.readonly) {
        return (
            <div className="result-empty">
                <FiPlay aria-hidden="true" />
                <h2>Consulta completada</h2>
                <p>{result.affectedRows} filas afectadas.</p>
            </div>
        );
    }
    return (
        <div className="result-empty">
            <FiPlay aria-hidden="true" />
            <h2>{hasDatabase ? "Lista para ejecutar" : "Abre un archivo SQLite"}</h2>
            <p>
                {hasDatabase
                    ? "Escribe una única sentencia SQL. Las escrituras requieren confirmación."
                    : "Selecciona un archivo local desde el panel lateral."}
            </p>
        </div>
    );
}

function resultSummary(result: SqliteQueryResult | null, error: string | null) {
    if (error) return error;
    if (!result) return "Sin ejecutar";
    if (!result.readonly) return `${result.affectedRows} filas afectadas`;
    return `${result.rows.length} filas${result.truncated ? " · límite alcanzado" : ""}`;
}

function formatCell(value: unknown) {
    if (value === null) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}
