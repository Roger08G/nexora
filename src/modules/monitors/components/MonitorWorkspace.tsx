import { useEffect, useState } from "react";
import { FiActivity, FiPlay, FiTrash2 } from "react-icons/fi";
import type { SavedRequest } from "@/modules/api/types";
import { formatInterval } from "@/modules/monitors/components/MonitorCreateDialog";
import type { LocalMonitor, MonitorRuntimeState } from "@/modules/monitors/types";
import { MONITOR_INTERVALS } from "@/modules/monitors/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type MonitorWorkspaceProps = {
    monitor: LocalMonitor | null;
    now: number;
    onDelete: () => void;
    onRun: () => void;
    onUpdate: (changes: Partial<LocalMonitor>) => void;
    requests: SavedRequest[];
    runtime?: MonitorRuntimeState;
};

export function MonitorWorkspace({
    monitor,
    now,
    onDelete,
    onRun,
    onUpdate,
    requests,
    runtime,
}: MonitorWorkspaceProps) {
    const [name, setName] = useState(monitor?.name ?? "");

    useEffect(() => setName(monitor?.name ?? ""), [monitor?.id, monitor?.name]);

    if (!monitor) {
        return (
            <div className="monitor-workspace monitor-workspace--empty">
                <FiActivity aria-hidden="true" />
                <h1>Monitores locales</h1>
                <p>Programa peticiones guardadas sin cuentas ni servicios externos.</p>
            </div>
        );
    }

    const currentRequest = requests.find((request) => request.id === monitor.requestId);
    const state = runtime ?? { runCount: 0, status: "idle" as const };

    return (
        <article className="monitor-workspace">
            <header className="monitor-workspace__header">
                <div>
                    <span>Monitor local</span>
                    <h1>{monitor.name}</h1>
                    <p>Se ejecuta únicamente mientras Nexora está abierto.</p>
                </div>
                <div>
                    <ActionButton icon={FiTrash2} onClick={onDelete} tone="ghost">
                        Eliminar
                    </ActionButton>
                    <ActionButton
                        disabled={!currentRequest || state.status === "running"}
                        icon={FiPlay}
                        onClick={onRun}
                        tone="primary"
                    >
                        {state.status === "running" ? "Ejecutando…" : "Ejecutar ahora"}
                    </ActionButton>
                </div>
            </header>

            <section className="monitor-card">
                <header>
                    <div>
                        <h2>Configuración</h2>
                        <p>
                            La definición se guarda en el proyecto y nunca incluye variables de
                            sesión.
                        </p>
                    </div>
                    <label className="settings-toggle" title="Activar monitor">
                        <span className="sr-only">Activar monitor</span>
                        <input
                            checked={monitor.enabled}
                            onChange={(event) => onUpdate({ enabled: event.target.checked })}
                            type="checkbox"
                        />
                        <span aria-hidden="true" />
                    </label>
                </header>
                <div className="monitor-fields">
                    <label>
                        <span>Nombre</span>
                        <input
                            maxLength={100}
                            onBlur={() => {
                                const normalized = name.trim();
                                if (normalized && normalized !== monitor.name)
                                    onUpdate({ name: normalized });
                                else setName(monitor.name);
                            }}
                            onChange={(event) => setName(event.target.value)}
                            value={name}
                        />
                    </label>
                    <label>
                        <span>Petición</span>
                        <select
                            onChange={(event) => {
                                const request = requests.find(
                                    (candidate) => candidate.id === event.target.value,
                                );
                                if (request) {
                                    onUpdate({ requestId: request.id, requestName: request.name });
                                }
                            }}
                            value={monitor.requestId}
                        >
                            {!currentRequest ? (
                                <option value={monitor.requestId}>Petición eliminada</option>
                            ) : null}
                            {requests.map((request) => (
                                <option key={request.id} value={request.id}>
                                    {request.method} · {request.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Frecuencia</span>
                        <select
                            onChange={(event) =>
                                onUpdate({ intervalSeconds: Number(event.target.value) })
                            }
                            value={monitor.intervalSeconds}
                        >
                            {MONITOR_INTERVALS.map((interval) => (
                                <option key={interval} value={interval}>
                                    {formatInterval(interval)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </section>

            <section className="monitor-card monitor-card--runtime">
                <header>
                    <div>
                        <h2>Estado local</h2>
                        <p>Las ejecuciones también quedan registradas en el historial privado.</p>
                    </div>
                    <RuntimeBadge enabled={monitor.enabled} state={state} />
                </header>
                <div className="monitor-runtime-grid">
                    <RuntimeMetric label="Próxima ejecución" value={nextRun(state, monitor, now)} />
                    <RuntimeMetric label="Última ejecución" value={lastRun(state.lastRunAt)} />
                    <RuntimeMetric label="Duración" value={formatDuration(state.durationMs)} />
                    <RuntimeMetric label="Ejecuciones" value={String(state.runCount)} />
                </div>
                {state.error ? <code className="monitor-runtime-error">{state.error}</code> : null}
                {!currentRequest ? (
                    <p className="inline-error">
                        La petición enlazada ya no existe. Selecciona otra ruta.
                    </p>
                ) : null}
            </section>
        </article>
    );
}

function RuntimeBadge({ enabled, state }: { enabled: boolean; state: MonitorRuntimeState }) {
    if (!enabled) return <StatusBadge>Desactivado</StatusBadge>;
    if (state.status === "running") return <StatusBadge tone="violet">Ejecutando</StatusBadge>;
    if (state.status === "error") return <StatusBadge tone="danger">Error</StatusBadge>;
    if (state.status === "success") {
        return <StatusBadge tone="success">HTTP {state.statusCode}</StatusBadge>;
    }
    return <StatusBadge tone="warning">Programado</StatusBadge>;
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function nextRun(state: MonitorRuntimeState, monitor: LocalMonitor, now: number) {
    if (!monitor.enabled) return "Pausado";
    if (!state.nextRunAt) return formatInterval(monitor.intervalSeconds);
    const remaining = Math.max(0, Math.ceil((state.nextRunAt - now) / 1_000));
    return remaining === 0 ? "Ahora" : `en ${remaining} s`;
}

function lastRun(timestamp?: number) {
    if (!timestamp) return "Sin ejecutar";
    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(timestamp);
}

function formatDuration(duration?: number) {
    return duration === undefined ? "—" : `${Math.round(duration)} ms`;
}
