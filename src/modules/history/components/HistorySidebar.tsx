import { FiSearch, FiTrash2 } from "react-icons/fi";
import type { HistoryEntry } from "@/modules/history/types";

type HistorySidebarProps = {
    entries: HistoryEntry[];
    loading: boolean;
    onClear: () => void;
    onQueryChange: (query: string) => void;
    onSelect: (entryId: string) => void;
    query: string;
    selectedId: string | null;
    totalEntries: number;
};

export function HistorySidebar({
    entries,
    loading,
    onClear,
    onQueryChange,
    onSelect,
    query,
    selectedId,
    totalEntries,
}: HistorySidebarProps) {
    return (
        <aside className="module-sidebar history-sidebar">
            <div className="module-sidebar__search">
                <FiSearch aria-hidden="true" />
                <input
                    aria-label="Filtrar historial"
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Filtrar historial"
                    value={query}
                />
                <button
                    aria-label="Vaciar historial"
                    disabled={totalEntries === 0}
                    onClick={onClear}
                    title="Vaciar historial"
                    type="button"
                >
                    <FiTrash2 aria-hidden="true" />
                </button>
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">Ejecuciones locales · {totalEntries}</p>
                {entries.map((entry) => (
                    <button
                        className="history-item"
                        data-active={entry.id === selectedId}
                        key={entry.id}
                        onClick={() => onSelect(entry.id)}
                        type="button"
                    >
                        <span className="method-label" data-method={entry.method}>
                            {entry.method}
                        </span>
                        <span className="history-item__content">
                            <strong>{entry.requestName}</strong>
                            <small>{formatTime(entry.executedAtMs)}</small>
                        </span>
                        <span
                            className="history-item__status"
                            data-error={Boolean(entry.error)}
                            data-success={entry.status ? entry.status < 400 : false}
                        >
                            {entry.error ? "ERR" : (entry.status ?? "—")}
                        </span>
                    </button>
                ))}
                {!loading && entries.length === 0 ? (
                    <p className="module-sidebar__empty">
                        {query
                            ? "No hay ejecuciones que coincidan."
                            : "Las peticiones ejecutadas aparecerán aquí."}
                    </p>
                ) : null}
                {loading ? <p className="module-sidebar__empty">Cargando historial…</p> : null}
            </div>
        </aside>
    );
}

function formatTime(timestamp: number) {
    return new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
    }).format(timestamp);
}
