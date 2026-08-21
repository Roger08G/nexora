import { FiDownload, FiPlay } from "react-icons/fi";
import type { PostgresQueryResult, PostgresSelection } from "@/modules/postgresql/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type PostgresWorkbenchProps = {
    error: string | null;
    isLoading: boolean;
    onExecute: () => void;
    onSqlChange: (sql: string) => void;
    result: PostgresQueryResult | null;
    selection: PostgresSelection | null;
    sql: string;
};

export function PostgresWorkbench({
    error,
    isLoading,
    onExecute,
    onSqlChange,
    result,
    selection,
    sql,
}: PostgresWorkbenchProps) {
    return (
        <div className="module-workbench">
            <header className="workspace-heading">
                <div>
                    <strong>Editor PostgreSQL</strong>
                    <small>·</small>
                    <span>{selection ? `${selection.schema}.${selection.table}` : "nexora"}</span>
                </div>
                <StatusBadge tone={error ? "danger" : result ? "success" : "neutral"}>
                    {error ? "Error" : result ? `${Math.round(result.durationMs)} ms` : "Preparado"}
                </StatusBadge>
                <div className="workspace-heading__actions">
                    <ActionButton disabled icon={FiDownload} tone="ghost">
                        Exportar CSV
                    </ActionButton>
                    <ActionButton
                        disabled={isLoading}
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
                    aria-label="Consulta PostgreSQL"
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
            <PostgresResult error={error} result={result} />
        </div>
    );
}

function PostgresResult({ error, result }: Pick<PostgresWorkbenchProps, "error" | "result">) {
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
    if (result) {
        return (
            <div className="result-empty">
                <FiPlay aria-hidden="true" />
                <h2>Sentencia completada</h2>
                <p>{result.affectedRows} filas afectadas.</p>
            </div>
        );
    }
    return (
        <div className="result-empty">
            <FiPlay aria-hidden="true" />
            <h2>PostgreSQL está listo</h2>
            <p>Ejecuta una sentencia SQL. Cualquier escritura requiere confirmación.</p>
        </div>
    );
}

function resultSummary(result: PostgresQueryResult | null, error: string | null) {
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
