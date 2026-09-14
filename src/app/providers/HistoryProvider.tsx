import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "@/shared/services/toast";
import { useProject } from "@/app/providers/ProjectProvider";
import {
    appendHistory,
    clearProjectHistory,
    deleteHistoryEntry,
    loadHistory,
} from "@/modules/history/services/history.service";
import type { HistoryEntry, RecordExecutionInput } from "@/modules/history/types";
import { getErrorMessage } from "@/shared/services/native";
import { KeyedTaskQueue } from "@/shared/services/async-tasks";

type HistoryContextValue = {
    clear: () => Promise<boolean>;
    entries: HistoryEntry[];
    loading: boolean;
    record: (input: RecordExecutionInput) => Promise<HistoryEntry | null>;
    remove: (entryId: string) => Promise<boolean>;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
    const { project, registerBeforeProjectChange } = useProject();
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const operations = useRef(new KeyedTaskQueue());
    const mounted = useRef(true);

    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );
    useEffect(
        () =>
            registerBeforeProjectChange(async () => {
                await operations.current.drain();
                return true;
            }),
        [registerBeforeProjectChange],
    );

    useEffect(() => {
        if (!project) return;
        let active = true;
        setLoading(true);
        operations.current
            .enqueue("history", () => loadHistory(project.root))
            .then((history) => {
                if (active) setEntries(history);
            })
            .catch((error) => {
                if (active) {
                    toast.error("No se pudo cargar el historial", {
                        description: getErrorMessage(error),
                    });
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [project]);

    const record = useCallback(
        async ({ error, request, response, source }: RecordExecutionInput) => {
            if (!project || !mounted.current) return null;
            return operations.current.enqueue("history", async () => {
                if (!mounted.current) return null;
                try {
                    const entry = await appendHistory(project.root, {
                        durationMs: response?.durationMs ?? null,
                        error: error ? "La ejecución no se completó" : null,
                        method: request.method,
                        requestId: request.id,
                        requestName: request.name,
                        sizeBytes: response?.sizeBytes ?? null,
                        source,
                        status: response?.status ?? null,
                        statusText: response?.statusText ?? "",
                        url: request.url,
                    });
                    setEntries((current) =>
                        [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 500),
                    );
                    return entry;
                } catch (cause) {
                    toast.error("No se pudo registrar la ejecución", {
                        description: getErrorMessage(cause),
                    });
                    return null;
                }
            });
        },
        [project],
    );

    const remove = useCallback(
        async (entryId: string) => {
            if (!project) return false;
            return operations.current.enqueue("history", async () => {
                try {
                    await deleteHistoryEntry(project.root, entryId);
                    setEntries((current) => current.filter((entry) => entry.id !== entryId));
                    return true;
                } catch (error) {
                    toast.error("No se pudo eliminar la entrada", {
                        description: getErrorMessage(error),
                    });
                    return false;
                }
            });
        },
        [project],
    );

    const clear = useCallback(async () => {
        if (!project) return false;
        return operations.current.enqueue("history", async () => {
            try {
                await clearProjectHistory(project.root);
                setEntries([]);
                return true;
            } catch (error) {
                toast.error("No se pudo limpiar el historial", {
                    description: getErrorMessage(error),
                });
                return false;
            }
        });
    }, [project]);

    const value = useMemo(
        () => ({ clear, entries, loading, record, remove }),
        [clear, entries, loading, record, remove],
    );

    return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
    const context = useContext(HistoryContext);
    if (!context) throw new Error("useHistory debe utilizarse dentro de HistoryProvider");
    return context;
}
