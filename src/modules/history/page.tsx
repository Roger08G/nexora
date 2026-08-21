import { useEffect, useMemo, useState } from "react";
import { FiClock, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useHistory } from "@/app/providers/HistoryProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { useSessionVariables } from "@/app/providers/SessionVariablesProvider";
import { executeRequest, loadRequests } from "@/modules/api/services/api.service";
import { HistoryDetails } from "@/modules/history/components/HistoryDetails";
import { HistorySidebar } from "@/modules/history/components/HistorySidebar";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { getErrorMessage } from "@/shared/services/native";

export function HistoryPage() {
    const { settings } = useAppSettings();
    const { clear, entries, loading, record, remove } = useHistory();
    const { project } = useProject();
    const { values } = useSessionVariables();
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const filteredEntries = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return entries;
        return entries.filter((entry) =>
            `${entry.requestName} ${entry.method} ${entry.url} ${entry.status ?? ""}`
                .toLowerCase()
                .includes(normalized),
        );
    }, [entries, query]);

    const selected =
        filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? null;

    useEffect(() => {
        if (!selectedId && entries[0]) setSelectedId(entries[0].id);
        if (selectedId && !entries.some((entry) => entry.id === selectedId)) {
            setSelectedId(entries[0]?.id ?? null);
        }
    }, [entries, selectedId]);

    async function repeat() {
        if (!selected || !project || running) return;
        setRunning(true);
        try {
            const requests = await loadRequests(project.root);
            const request = requests.find((candidate) => candidate.id === selected.requestId);
            if (!request) throw new Error("La petición original ya no existe en el proyecto.");
            try {
                const response = await executeRequest(request, values, settings.requestTimeoutMs);
                const entry = await record({ request, response, source: "api" });
                if (entry) setSelectedId(entry.id);
                toast.success(`${request.name}: ${response.status}`, {
                    description: "Ejecución repetida desde el historial",
                });
            } catch (error) {
                const message = getErrorMessage(error);
                const entry = await record({ error: message, request, source: "api" });
                if (entry) setSelectedId(entry.id);
                throw error;
            }
        } catch (error) {
            toast.error("No se pudo repetir la petición", {
                description: getErrorMessage(error),
            });
        } finally {
            setRunning(false);
        }
    }

    async function removeSelected() {
        if (!selected) return;
        if (await remove(selected.id)) toast.success("Entrada de historial eliminada");
    }

    async function clearAll() {
        setConfirmClear(false);
        if (await clear()) toast.success("Historial local eliminado");
    }

    return (
        <section className="module-page history-page">
            <HistorySidebar
                entries={filteredEntries}
                loading={loading}
                onClear={() => setConfirmClear(true)}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
                query={query}
                selectedId={selected?.id ?? null}
                totalEntries={entries.length}
            />
            <HistoryDetails
                entry={selected}
                onDelete={() => void removeSelected()}
                onRepeat={() => void repeat()}
                running={running}
            />
            {confirmClear ? (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="clear-history-title"
                        aria-modal="true"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <span className="confirmation-dialog__icon">
                            <FiClock aria-hidden="true" />
                        </span>
                        <h2 id="clear-history-title">Vaciar historial local</h2>
                        <p>
                            Se eliminarán las {entries.length} ejecuciones guardadas. Las peticiones
                            del proyecto no se modificarán.
                        </p>
                        <footer>
                            <ActionButton onClick={() => setConfirmClear(false)} tone="ghost">
                                Cancelar
                            </ActionButton>
                            <ActionButton icon={FiTrash2} onClick={() => void clearAll()}>
                                Vaciar historial
                            </ActionButton>
                        </footer>
                    </section>
                </div>
            ) : null}
        </section>
    );
}
