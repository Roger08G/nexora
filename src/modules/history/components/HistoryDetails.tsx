import type { ReactNode } from "react";
import { FiClock, FiPlay, FiTrash2 } from "react-icons/fi";
import type { HistoryEntry } from "@/modules/history/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type HistoryDetailsProps = {
    entry: HistoryEntry | null;
    onDelete: () => void;
    onRepeat: () => void;
    running: boolean;
};

export function HistoryDetails({ entry, onDelete, onRepeat, running }: HistoryDetailsProps) {
    if (!entry) {
        return (
            <div className="history-details history-details--empty">
                <FiClock aria-hidden="true" />
                <h1>Historial local</h1>
                <p>Ejecuta una petición o un monitor para empezar a registrar actividad.</p>
            </div>
        );
    }

    return (
        <article className="history-details">
            <header className="history-details__header">
                <div>
                    <span className="history-details__source">
                        {entry.source === "monitor" ? "Monitor local" : "Cliente API"}
                    </span>
                    <h1>{entry.requestName}</h1>
                    <p>
                        <span className="method-label" data-method={entry.method}>
                            {entry.method}
                        </span>
                        <code>{entry.url}</code>
                    </p>
                </div>
                <div className="history-details__actions">
                    <ActionButton icon={FiTrash2} onClick={onDelete} tone="ghost">
                        Eliminar
                    </ActionButton>
                    <ActionButton
                        disabled={running}
                        icon={FiPlay}
                        onClick={onRepeat}
                        tone="primary"
                    >
                        {running ? "Ejecutando…" : "Repetir"}
                    </ActionButton>
                </div>
            </header>

            <div className="history-details__metrics">
                <Metric label="Estado">
                    {entry.error ? (
                        <StatusBadge tone="danger">Error</StatusBadge>
                    ) : (
                        <StatusBadge
                            tone={entry.status && entry.status < 400 ? "success" : "warning"}
                        >
                            {entry.status} {entry.statusText}
                        </StatusBadge>
                    )}
                </Metric>
                <Metric label="Duración" value={formatDuration(entry.durationMs)} />
                <Metric label="Tamaño" value={formatBytes(entry.sizeBytes)} />
                <Metric label="Ejecutada" value={formatDate(entry.executedAtMs)} />
            </div>

            {entry.error ? (
                <section className="history-details__error">
                    <span>Error de ejecución</span>
                    <code>{entry.error}</code>
                </section>
            ) : null}

            <section className="history-details__notice">
                <strong>Historial privado del proyecto</strong>
                <p>
                    Nexora conserva solo metadatos de ejecución. No guarda variables de sesión,
                    headers, cuerpos de petición ni cuerpos de respuesta en el historial.
                </p>
            </section>
        </article>
    );
}

function Metric({
    children,
    label,
    value,
}: {
    children?: ReactNode;
    label: string;
    value?: string;
}) {
    return (
        <div className="history-metric">
            <span>{label}</span>
            {children ?? <strong>{value}</strong>}
        </div>
    );
}

function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "medium" }).format(
        timestamp,
    );
}

function formatDuration(duration: number | null) {
    return duration === null ? "—" : `${Math.round(duration)} ms`;
}

function formatBytes(bytes: number | null) {
    if (bytes === null) return "—";
    if (bytes < 1_024) return `${bytes} B`;
    return `${(bytes / 1_024).toFixed(bytes >= 10_240 ? 0 : 1)} KB`;
}
