import { FiDownload, FiPlay } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type SqlWorkbenchProps = {
    onSqlChange: (sql: string) => void;
    selectedTable: string;
    sql: string;
};

export function SqlWorkbench({ onSqlChange, selectedTable, sql }: SqlWorkbenchProps) {
    return (
        <div className="module-workbench">
            <header className="workspace-heading">
                <div>
                    <strong>Editor SQL</strong>
                    <small>·</small>
                    <span>{selectedTable}</span>
                </div>
                <StatusBadge>Solo interfaz</StatusBadge>
                <div className="workspace-heading__actions">
                    <ActionButton disabled icon={FiDownload} tone="ghost">
                        Exportar CSV
                    </ActionButton>
                    <ActionButton
                        disabled
                        icon={FiPlay}
                        title="Motor SQLite pendiente"
                        tone="primary"
                    >
                        Ejecutar
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
                <span className="panel-heading__context">Sin ejecutar</span>
            </div>
            <div className="result-empty">
                <FiPlay aria-hidden="true" />
                <h2>Abre un archivo SQLite para ejecutar la consulta</h2>
                <p>
                    El frontend no modifica ni simula datos mientras el núcleo Rust no esté
                    conectado.
                </p>
            </div>
        </div>
    );
}
