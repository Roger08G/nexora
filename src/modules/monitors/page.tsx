import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiTrash2 } from "react-icons/fi";
import { toast } from "@/shared/services/toast";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { useHistory } from "@/app/providers/HistoryProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { useSessionVariables } from "@/app/providers/SessionVariablesProvider";
import { executeRequest, loadRequests } from "@/modules/api/services/api.service";
import type { SavedRequest } from "@/modules/api/types";
import { MonitorCreateDialog } from "@/modules/monitors/components/MonitorCreateDialog";
import { MonitorSidebar } from "@/modules/monitors/components/MonitorSidebar";
import { MonitorWorkspace } from "@/modules/monitors/components/MonitorWorkspace";
import {
    deleteSavedMonitor,
    loadMonitors,
    persistMonitor,
} from "@/modules/monitors/services/monitors.service";
import type { LocalMonitor, MonitorRuntimeState } from "@/modules/monitors/types";
import { ActionButton } from "@/shared/components/ui/ActionButton";
import { getErrorMessage } from "@/shared/services/native";
import { KeyedTaskQueue } from "@/shared/services/async-tasks";
import { MonitorScheduleSession } from "@/modules/monitors/services/scheduling";

export function MonitorsPage() {
    const { settings } = useAppSettings();
    const { registerItems } = useGlobalSearch();
    const { record } = useHistory();
    const { busy, project, projectLoad, registerBeforeProjectChange } = useProject();
    const { values } = useSessionVariables();
    const [monitors, setMonitors] = useState<LocalMonitor[]>([]);
    const [requests, setRequests] = useState<SavedRequest[]>([]);
    const [runtime, setRuntime] = useState<Record<string, MonitorRuntimeState>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<LocalMonitor | null>(null);
    const [now, setNow] = useState(Date.now());
    const [, refreshScheduling] = useState(0);
    const scheduleSession = useRef(new MonitorScheduleSession());
    const requestsRef = useRef(requests);
    const valuesRef = useRef(values);
    const timeoutRef = useRef(settings.requestTimeoutMs);
    const runningIds = useRef(new Set<string>());
    const deletingIds = useRef(new Set<string>());
    const monitorQueue = useRef(new KeyedTaskQueue());
    const monitorsRef = useRef(monitors);
    const mounted = useRef(true);
    const paused = busy || Boolean(projectLoad);
    const pausedRef = useRef(paused);
    const schedulingEnabled = scheduleSession.current.isAllowed(project);

    useLayoutEffect(() => {
        pausedRef.current = paused;
    }, [paused]);
    useLayoutEffect(() => {
        scheduleSession.current.pause();
        refreshScheduling((current) => current + 1);
        return () => scheduleSession.current.pause();
    }, [project]);
    useEffect(
        () =>
            registerBeforeProjectChange(async () => {
                scheduleSession.current.pause();
                refreshScheduling((current) => current + 1);
                await monitorQueue.current.drain();
                return true;
            }),
        [registerBeforeProjectChange],
    );

    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );

    function updateMonitors(update: (current: LocalMonitor[]) => LocalMonitor[]) {
        const next = update(monitorsRef.current);
        monitorsRef.current = next;
        setMonitors(next);
    }

    useEffect(() => {
        requestsRef.current = requests;
    }, [requests]);
    useEffect(() => {
        valuesRef.current = values;
    }, [values]);
    useEffect(() => {
        timeoutRef.current = settings.requestTimeoutMs;
    }, [settings.requestTimeoutMs]);

    useEffect(() => {
        if (!project) return;
        let active = true;
        setLoading(true);
        Promise.all([loadMonitors(project.root), loadRequests(project.root)])
            .then(([savedMonitors, savedRequests]) => {
                if (!active) return;
                updateMonitors(() => savedMonitors);
                setRequests(savedRequests);
                requestsRef.current = savedRequests;
                setSelectedId(savedMonitors[0]?.id ?? null);
            })
            .catch((error) => {
                if (active) {
                    toast.error("No se pudieron cargar los monitores", {
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

    const hasScheduledMonitors = monitors.some((monitor) => monitor.enabled);
    useEffect(() => {
        if (!hasScheduledMonitors || paused || !schedulingEnabled) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [hasScheduledMonitors, paused, schedulingEnabled]);

    const runMonitor = useCallback(
        async (monitor: LocalMonitor, mode: "manual" | "scheduled") => {
            const notify = mode === "manual";
            const hasPermission = scheduleSession.current.capture(project);
            const canRun = () =>
                mounted.current &&
                !pausedRef.current &&
                !deletingIds.current.has(monitor.id) &&
                (mode === "manual" ||
                    (hasPermission() &&
                        monitorsRef.current.some(
                            (item) => item.id === monitor.id && item.enabled,
                        )));
            if (!canRun() || runningIds.current.has(monitor.id)) return;
            runningIds.current.add(monitor.id);
            setRuntimeState(monitor.id, { error: undefined, status: "running" });
            const variables = valuesRef.current;
            const timeout = timeoutRef.current;
            let runningRequest: SavedRequest | undefined;
            let executionStarted = false;
            try {
                if (!project) throw new Error("No hay un proyecto cargado.");
                const currentRequests = await loadRequests(project.root);
                if (!canRun()) return;
                setRequests(currentRequests);
                requestsRef.current = currentRequests;
                const request = currentRequests.find(
                    (candidate) => candidate.id === monitor.requestId,
                );
                if (!request) throw new Error("La petición enlazada ya no existe.");
                runningRequest = request;
                executionStarted = true;
                const response = await executeRequest(request, variables, timeout);
                if (!mounted.current) return;
                await record({ request, response, source: "monitor" });
                if (!mounted.current || deletingIds.current.has(monitor.id)) return;
                const successful = response.status < 400;
                const responseError = successful
                    ? undefined
                    : `HTTP ${response.status} ${response.statusText}`.trim();
                setRuntime((current) => ({
                    ...current,
                    [monitor.id]: {
                        ...current[monitor.id],
                        durationMs: response.durationMs,
                        error: responseError,
                        lastRunAt: Date.now(),
                        runCount: (current[monitor.id]?.runCount ?? 0) + 1,
                        status: successful ? "success" : "error",
                        statusCode: response.status,
                    },
                }));
                if (notify && successful) {
                    toast.success(`${monitor.name}: HTTP ${response.status}`, {
                        description: `${Math.round(response.durationMs)} ms`,
                    });
                }
                if (notify && !successful) {
                    toast.error(`${monitor.name}: HTTP ${response.status}`, {
                        description: response.statusText || "Respuesta HTTP no satisfactoria",
                    });
                }
            } catch (error) {
                if (!mounted.current) return;
                const message = getErrorMessage(error);
                const request = runningRequest;
                if (request) await record({ error: message, request, source: "monitor" });
                if (!mounted.current || deletingIds.current.has(monitor.id)) return;
                setRuntime((current) => ({
                    ...current,
                    [monitor.id]: {
                        ...current[monitor.id],
                        error: message,
                        lastRunAt: Date.now(),
                        runCount: (current[monitor.id]?.runCount ?? 0) + 1,
                        status: "error",
                        statusCode: undefined,
                    },
                }));
                if (notify) toast.error(`Error en ${monitor.name}`, { description: message });
            } finally {
                runningIds.current.delete(monitor.id);
                if (!executionStarted && mounted.current) {
                    setRuntime((current) =>
                        current[monitor.id]?.status === "running"
                            ? {
                                  ...current,
                                  [monitor.id]: { ...current[monitor.id], status: "idle" },
                              }
                            : current,
                    );
                }
            }
        },
        [project, record],
    );

    useEffect(() => {
        const activeMonitors =
            paused || !schedulingEnabled ? [] : monitors.filter((monitor) => monitor.enabled);
        const nextRuntime = Object.fromEntries(
            activeMonitors.map((monitor) => [
                monitor.id,
                {
                    nextRunAt: Date.now() + monitor.intervalSeconds * 1_000,
                },
            ]),
        );
        setRuntime((current) => {
            const next = { ...current };
            for (const monitor of monitors) {
                next[monitor.id] = {
                    ...(current[monitor.id] ?? { runCount: 0, status: "idle" }),
                    nextRunAt: nextRuntime[monitor.id]?.nextRunAt,
                };
            }
            return next;
        });

        const timers = activeMonitors.map((monitor) =>
            window.setInterval(() => {
                setRuntimeState(monitor.id, {
                    nextRunAt: Date.now() + monitor.intervalSeconds * 1_000,
                });
                void runMonitor(monitor, "scheduled");
            }, monitor.intervalSeconds * 1_000),
        );
        return () => timers.forEach((timer) => window.clearInterval(timer));
    }, [monitors, paused, runMonitor, schedulingEnabled]);

    function toggleScheduling() {
        if (!project || paused || loading) return;
        if (scheduleSession.current.isAllowed(project)) {
            scheduleSession.current.pause();
            toast.info("Programación pausada", {
                description: "Las peticiones ya enviadas pueden terminar.",
            });
        } else {
            scheduleSession.current.start(project);
            toast.info("Programación iniciada", {
                description: "Solo para esta sesión del proyecto.",
            });
        }
        refreshScheduling((current) => current + 1);
    }

    useEffect(() => {
        registerItems(
            "local-monitors",
            monitors.map((monitor) => ({
                action: () => setSelectedId(monitor.id),
                description: `${monitor.requestName} · cada ${monitor.intervalSeconds} s`,
                group: "Monitores",
                icon: FiActivity,
                id: `monitor-${monitor.id}`,
                keywords: `${monitor.name} ${monitor.requestName}`,
                title: monitor.name,
                workspace: "monitors",
            })),
        );
    }, [monitors, registerItems]);

    const filteredMonitors = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return monitors;
        return monitors.filter((monitor) =>
            `${monitor.name} ${monitor.requestName}`.toLowerCase().includes(normalized),
        );
    }, [monitors, query]);
    const selected = monitors.find((monitor) => monitor.id === selectedId) ?? monitors[0] ?? null;

    async function createMonitor(name: string, request: SavedRequest, intervalSeconds: number) {
        if (!project) return;
        setSaving(true);
        try {
            const monitor: LocalMonitor = {
                createdAtMs: 0,
                enabled: true,
                id: `monitor-${crypto.randomUUID()}`,
                intervalSeconds,
                name,
                requestId: request.id,
                requestName: request.name,
                updatedAtMs: 0,
            };
            const saved = await monitorQueue.current.enqueue(monitor.id, () =>
                persistMonitor(project.root, monitor),
            );
            updateMonitors((current) => [...current, saved]);
            setSelectedId(saved.id);
            setCreating(false);
            toast.success("Monitor local creado", { description: saved.name });
        } catch (error) {
            toast.error("No se pudo crear el monitor", {
                description: getErrorMessage(error),
            });
        } finally {
            setSaving(false);
        }
    }

    async function openCreateDialog() {
        if (!project) return;
        try {
            const currentRequests = await loadRequests(project.root);
            setRequests(currentRequests);
            requestsRef.current = currentRequests;
            setCreating(true);
        } catch (error) {
            toast.error("No se pudieron cargar las peticiones", {
                description: getErrorMessage(error),
            });
        }
    }

    async function updateMonitor(changes: Partial<LocalMonitor>) {
        if (!project || !selected) return;
        return monitorQueue.current.enqueue(selected.id, async () => {
            if (deletingIds.current.has(selected.id)) return;
            const latest = monitorsRef.current.find((monitor) => monitor.id === selected.id);
            if (!latest) return;
            try {
                const saved = await persistMonitor(project.root, { ...latest, ...changes });
                updateMonitors((current) =>
                    current.map((monitor) => (monitor.id === saved.id ? saved : monitor)),
                );
                toast.success("Monitor actualizado", { description: saved.name });
            } catch (error) {
                toast.error("No se pudo actualizar el monitor", {
                    description: getErrorMessage(error),
                });
            }
        });
    }

    async function deleteMonitor() {
        if (!project || !deleteTarget || deletingIds.current.has(deleteTarget.id)) return;
        deletingIds.current.add(deleteTarget.id);
        try {
            await monitorQueue.current.enqueue(deleteTarget.id, () =>
                deleteSavedMonitor(project.root, deleteTarget.id),
            );
            const remaining = monitorsRef.current.filter(
                (monitor) => monitor.id !== deleteTarget.id,
            );
            updateMonitors(() => remaining);
            setSelectedId(remaining[0]?.id ?? null);
            setRuntime((current) => {
                const next = { ...current };
                delete next[deleteTarget.id];
                return next;
            });
            toast.success("Monitor eliminado", { description: deleteTarget.name });
            setDeleteTarget(null);
        } catch (error) {
            deletingIds.current.delete(deleteTarget.id);
            toast.error("No se pudo eliminar el monitor", {
                description: getErrorMessage(error),
            });
        }
    }

    function setRuntimeState(monitorId: string, changes: Partial<MonitorRuntimeState>) {
        setRuntime((current) => ({
            ...current,
            [monitorId]: {
                ...(current[monitorId] ?? { runCount: 0, status: "idle" }),
                ...changes,
            },
        }));
    }

    return (
        <section className="module-page monitors-page">
            <MonitorSidebar
                loading={loading}
                monitors={filteredMonitors}
                onCreate={() => void openCreateDialog()}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
                query={query}
                runtime={runtime}
                schedulingEnabled={schedulingEnabled && !paused}
                selectedId={selected?.id ?? null}
                totalMonitors={monitors.length}
            />
            <MonitorWorkspace
                monitor={selected}
                now={now}
                onDelete={() => selected && setDeleteTarget(selected)}
                onRun={() => selected && void runMonitor(selected, "manual")}
                onToggleScheduling={toggleScheduling}
                onUpdate={(changes) => void updateMonitor(changes)}
                requests={requests}
                runtime={selected ? runtime[selected.id] : undefined}
                schedulingEnabled={schedulingEnabled && !paused}
            />
            {creating ? (
                <MonitorCreateDialog
                    busy={saving}
                    onClose={() => setCreating(false)}
                    onConfirm={(name, request, interval) =>
                        void createMonitor(name, request, interval)
                    }
                    requests={requests}
                />
            ) : null}
            {deleteTarget ? (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="delete-monitor-title"
                        aria-modal="true"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <span className="confirmation-dialog__icon">
                            <FiActivity aria-hidden="true" />
                        </span>
                        <h2 id="delete-monitor-title">Eliminar monitor</h2>
                        <p>
                            Se eliminará <strong>{deleteTarget.name}</strong>. El historial y la
                            petición enlazada se conservarán.
                        </p>
                        <footer>
                            <ActionButton onClick={() => setDeleteTarget(null)} tone="ghost">
                                Cancelar
                            </ActionButton>
                            <ActionButton icon={FiTrash2} onClick={() => void deleteMonitor()}>
                                Eliminar monitor
                            </ActionButton>
                        </footer>
                    </section>
                </div>
            ) : null}
        </section>
    );
}
