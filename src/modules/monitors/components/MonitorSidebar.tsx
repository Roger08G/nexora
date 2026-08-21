import { FiActivity, FiPlus, FiSearch } from "react-icons/fi";
import type { LocalMonitor, MonitorRuntimeState } from "@/modules/monitors/types";

type MonitorSidebarProps = {
    loading: boolean;
    monitors: LocalMonitor[];
    onCreate: () => void;
    onQueryChange: (query: string) => void;
    onSelect: (monitorId: string) => void;
    query: string;
    runtime: Record<string, MonitorRuntimeState>;
    selectedId: string | null;
    totalMonitors: number;
};

export function MonitorSidebar({
    loading,
    monitors,
    onCreate,
    onQueryChange,
    onSelect,
    query,
    runtime,
    selectedId,
    totalMonitors,
}: MonitorSidebarProps) {
    return (
        <aside className="module-sidebar monitor-sidebar">
            <div className="module-sidebar__search">
                <FiSearch aria-hidden="true" />
                <input
                    aria-label="Filtrar monitores"
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Filtrar monitores"
                    value={query}
                />
                <button
                    aria-label="Nuevo monitor"
                    onClick={onCreate}
                    title="Nuevo monitor"
                    type="button"
                >
                    <FiPlus aria-hidden="true" />
                </button>
            </div>
            <div className="module-sidebar__content">
                <p className="eyebrow">Monitores locales · {totalMonitors}</p>
                {monitors.map((monitor) => {
                    const state = runtime[monitor.id];
                    return (
                        <button
                            className="monitor-item"
                            data-active={monitor.id === selectedId}
                            key={monitor.id}
                            onClick={() => onSelect(monitor.id)}
                            type="button"
                        >
                            <span
                                className="monitor-item__indicator"
                                data-enabled={monitor.enabled}
                                data-status={state?.status ?? "idle"}
                            />
                            <span>
                                <strong>{monitor.name}</strong>
                                <small>{monitor.requestName}</small>
                            </span>
                            <FiActivity aria-hidden="true" />
                        </button>
                    );
                })}
                {!loading && monitors.length === 0 ? (
                    <p className="module-sidebar__empty">
                        {query
                            ? "No hay monitores que coincidan."
                            : "Crea un monitor para ejecutar rutas de forma periódica."}
                    </p>
                ) : null}
                {loading ? <p className="module-sidebar__empty">Cargando monitores…</p> : null}
            </div>
        </aside>
    );
}
