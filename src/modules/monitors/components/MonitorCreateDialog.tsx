import { useState } from "react";
import { FiActivity } from "react-icons/fi";
import type { SavedRequest } from "@/modules/api/types";
import { MONITOR_INTERVALS } from "@/modules/monitors/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MonitorCreateDialogProps = {
    busy: boolean;
    onClose: () => void;
    onConfirm: (name: string, request: SavedRequest, intervalSeconds: number) => void;
    requests: SavedRequest[];
};

export function MonitorCreateDialog({
    busy,
    onClose,
    onConfirm,
    requests,
}: MonitorCreateDialogProps) {
    const [name, setName] = useState("");
    const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
    const [intervalSeconds, setIntervalSeconds] = useState(60);
    const request = requests.find((candidate) => candidate.id === requestId);
    const valid = Boolean(name.trim() && request);

    return (
        <div className="modal-backdrop" role="presentation">
            <form
                aria-labelledby="new-monitor-title"
                aria-modal="true"
                className="monitor-dialog"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (request && valid) onConfirm(name.trim(), request, intervalSeconds);
                }}
                role="dialog"
            >
                <header>
                    <span>
                        <FiActivity aria-hidden="true" />
                    </span>
                    <div>
                        <h2 id="new-monitor-title">Nuevo monitor local</h2>
                        <p>Ejecutará una petición guardada mientras Nexora permanezca abierto.</p>
                    </div>
                </header>
                <div className="monitor-dialog__fields">
                    <label>
                        <span>Nombre</span>
                        <input
                            autoFocus
                            maxLength={100}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Health del backend"
                            value={name}
                        />
                    </label>
                    <label>
                        <span>Petición guardada</span>
                        <select
                            disabled={requests.length === 0}
                            onChange={(event) => setRequestId(event.target.value)}
                            value={requestId}
                        >
                            {requests.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.method} · {candidate.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Frecuencia</span>
                        <select
                            onChange={(event) => setIntervalSeconds(Number(event.target.value))}
                            value={intervalSeconds}
                        >
                            {MONITOR_INTERVALS.map((interval) => (
                                <option key={interval} value={interval}>
                                    {formatInterval(interval)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {requests.length === 0 ? (
                        <p className="inline-error">
                            Guarda al menos una petición antes de crear un monitor.
                        </p>
                    ) : null}
                </div>
                <footer>
                    <ActionButton disabled={busy} onClick={onClose} tone="ghost">
                        Cancelar
                    </ActionButton>
                    <ActionButton disabled={!valid || busy} tone="primary" type="submit">
                        {busy ? "Creando…" : "Crear monitor"}
                    </ActionButton>
                </footer>
            </form>
        </div>
    );
}

export function formatInterval(seconds: number) {
    if (seconds < 60) return `${seconds} segundos`;
    if (seconds < 3_600) return `${seconds / 60} min`;
    return `${seconds / 3_600} h`;
}
