import { useEffect, useMemo, useRef, useState } from "react";
import { FiZap } from "react-icons/fi";
import { toast } from "@/shared/services/toast";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { useSessionVariables } from "@/app/providers/SessionVariablesProvider";
import { useHistory } from "@/app/providers/HistoryProvider";
import { ApiSidebar } from "@/modules/api/components/ApiSidebar";
import { RequestEditor } from "@/modules/api/components/RequestEditor";
import { RequestTabs } from "@/modules/api/components/RequestTabs";
import { ResponsePanel } from "@/modules/api/components/ResponsePanel";
import {
    createRequestFolder,
    deleteSavedRequest,
    executeRequest,
    loadRequestFolders,
    loadRequests,
    persistRequest,
} from "@/modules/api/services/api.service";
import type {
    RequestDraft,
    RequestFolder,
    RequestFolderSummary,
    RequestSaveState,
    ResponseState,
    SavedRequest,
} from "@/modules/api/types";
import { getErrorMessage } from "@/shared/services/native";
import { KeyedTaskQueue, LatestOperation } from "@/shared/services/async-tasks";

export function ApiPage() {
    const { settings } = useAppSettings();
    const { registerItems } = useGlobalSearch();
    const { project, registerBeforeProjectChange } = useProject();
    const { values: sessionVariables } = useSessionVariables();
    const { record: recordHistory } = useHistory();
    const [folderSummaries, setFolderSummaries] = useState<RequestFolderSummary[]>(() => [
        DEFAULT_FOLDER,
    ]);
    const [requests, setRequests] = useState<SavedRequest[]>(() => [newRequest(DEFAULT_FOLDER)]);
    const [openRequestIds, setOpenRequestIdsState] = useState<string[]>(() => [requests[0].id]);
    const [activeRequestId, setActiveRequestIdState] = useState(requests[0].id);
    const [responseState, setResponseState] = useState<ResponseState>({ status: "idle" });
    const [saveStates, setSaveStates] = useState<Record<string, RequestSaveState>>({});
    const [requestsLoaded, setRequestsLoaded] = useState(false);
    const [runningRequestIds, setRunningRequestIds] = useState<string[]>([]);
    const requestsRef = useRef(requests);
    const openRequestIdsRef = useRef(openRequestIds);
    const activeRequestIdRef = useRef(activeRequestId);
    const savedSnapshots = useRef(new Map<string, string>());
    const saveQueue = useRef(new KeyedTaskQueue());
    const deletingIds = useRef(new Set<string>());
    const runningIds = useRef(new Set<string>());
    const responseOperation = useRef(new LatestOperation());
    const navigationOperation = useRef(new LatestOperation());
    const pageRef = useRef<HTMLElement>(null);

    useEffect(
        () => () => {
            responseOperation.current.invalidate();
            navigationOperation.current.invalidate();
        },
        [],
    );

    useEffect(() => {
        requestsRef.current = requests;
    }, [requests]);

    useEffect(() => {
        if (!project) return;
        let active = true;
        setRequestsLoaded(false);
        Promise.all([loadRequests(project.root), loadRequestFolders(project.root)])
            .then(([saved, savedFolders]) => {
                if (!active) return;
                const nextFolders = savedFolders.length ? savedFolders : [DEFAULT_FOLDER];
                const next = saved.length > 0 ? saved : [newRequest(nextFolders[0])];
                requestsRef.current = next;
                savedSnapshots.current = new Map(
                    saved.map((request) => [request.id, requestSnapshot(request)]),
                );
                setRequests(next);
                setFolderSummaries(nextFolders);
                setSaveStates(
                    Object.fromEntries(saved.map((request) => [request.id, "saved" as const])),
                );
                setOpenRequestIds([next[0].id]);
                setActiveRequestId(next[0].id);
                resetResponse();
                setRequestsLoaded(true);
            })
            .catch((error) => {
                if (!active) return;
                const message = getErrorMessage(error);
                setResponseState({ status: "error", message });
                toast.error("No se pudieron cargar las peticiones", { description: message });
            });
        return () => {
            active = false;
        };
    }, [project]);

    const folders = useMemo(
        () => buildFolders(folderSummaries, requests),
        [folderSummaries, requests],
    );
    const openRequests = openRequestIds.flatMap((id) => {
        const request = requests.find((candidate) => candidate.id === id);
        return request ? [request] : [];
    });
    const activeRequest = requests.find((request) => request.id === activeRequestId) ?? requests[0];
    const activeDraft: RequestDraft = activeRequest;

    useEffect(() => {
        registerItems(
            "api-requests",
            requests.map((request) => ({
                action: () => void activateRequest(request.id),
                description: `${request.method} ${request.url}`,
                group: "Peticiones",
                icon: FiZap,
                id: `request-${request.id}`,
                keywords: `${request.name} ${request.method} ${request.url} ${request.collectionName}`,
                title: request.name,
                workspace: "api",
            })),
        );
    }, [activeRequestId, registerItems, requests]);

    useEffect(() => {
        if (!project || !requestsLoaded || !settings.autoSaveRequests || !activeRequest) return;
        if (
            !saveQueue.current.has(activeRequest.id) &&
            savedSnapshots.current.get(activeRequest.id) === requestSnapshot(activeRequest)
        ) {
            setRequestSaveState(activeRequest.id, "saved");
            return;
        }
        const timer = window.setTimeout(() => {
            void saveRequest(activeRequest, "auto");
        }, settings.autoSaveDelayMs);
        return () => window.clearTimeout(timer);
    }, [
        activeRequest,
        project,
        requestsLoaded,
        settings.autoSaveDelayMs,
        settings.autoSaveRequests,
    ]);

    useEffect(
        () =>
            registerBeforeProjectChange(async () => {
                if (!project || !requestsLoaded || !settings.autoSaveRequests) return true;
                const results = await Promise.all(
                    requestsRef.current
                        .filter((request) => !deletingIds.current.has(request.id))
                        .map((request) => saveRequest(request, "switch")),
                );
                return results.every(Boolean);
            }),
        [project, registerBeforeProjectChange, requestsLoaded, settings.autoSaveRequests],
    );

    useEffect(
        () => () => {
            if (!project || !requestsLoaded || !settings.autoSaveRequests) return;
            for (const request of requestsRef.current) {
                if (savedSnapshots.current.get(request.id) !== requestSnapshot(request)) {
                    void saveRequest(request, "switch");
                }
            }
        },
        [project, requestsLoaded, settings.autoSaveRequests],
    );

    async function create(folder?: RequestFolderSummary) {
        const isCurrent = navigationOperation.current.next();
        await flushActiveRequest();
        if (!isCurrent()) return;
        const targetFolder =
            folder ??
            folders.find((candidate) => candidate.id === activeRequest.collectionId) ??
            folders[0] ??
            DEFAULT_FOLDER;
        const request = newRequest(targetFolder);
        setRequestsAndRef((current) => [...current, request]);
        setOpenRequestIds((current) => [...current, request.id]);
        setActiveRequestId(request.id);
        resetResponse();
        toast.info("Nueva ruta creada", { description: targetFolder.name });
    }

    async function createFolder(name: string) {
        if (!project) return;
        try {
            const folder = await createRequestFolder(project.root, name);
            setFolderSummaries((current) => [...current, folder]);
            toast.success("Carpeta creada", { description: folder.name });
        } catch (error) {
            toast.error("No se pudo crear la carpeta", { description: getErrorMessage(error) });
        }
    }

    async function renameRequest(request: SavedRequest, name: string) {
        const normalizedName = name.trim();
        if (!normalizedName || normalizedName === request.name) return;
        const latest = requestsRef.current.find((candidate) => candidate.id === request.id);
        if (!latest || deletingIds.current.has(request.id)) return;
        const renamed = { ...latest, name: normalizedName };
        setRequestsAndRef((current) =>
            current.map((candidate) => (candidate.id === request.id ? renamed : candidate)),
        );
        setRequestSaveState(request.id, "idle");
        await saveRequest(renamed, "rename");
    }

    async function deleteRequest(request: SavedRequest) {
        if (!project || deletingIds.current.has(request.id)) return;
        deletingIds.current.add(request.id);
        try {
            await saveQueue.current.enqueue(request.id, async () => {
                if (savedSnapshots.current.has(request.id)) {
                    await deleteSavedRequest(project.root, request.collectionId, request.id);
                }
            });
            savedSnapshots.current.delete(request.id);
            const remaining = requestsRef.current.filter(
                (candidate) => candidate.id !== request.id,
            );
            const fallbackFolder =
                folders.find((folder) => folder.id === request.collectionId) ??
                folders[0] ??
                DEFAULT_FOLDER;
            const nextRequests = remaining.length ? remaining : [newRequest(fallbackFolder)];
            requestsRef.current = nextRequests;
            setRequests(nextRequests);
            setSaveStates((current) => {
                const next = { ...current };
                delete next[request.id];
                return next;
            });

            const nextOpenIds = openRequestIdsRef.current.filter((id) => id !== request.id);
            const normalizedOpenIds = nextOpenIds.length ? nextOpenIds : [nextRequests[0].id];
            setOpenRequestIds(normalizedOpenIds);
            if (activeRequestIdRef.current === request.id) {
                setActiveRequestId(normalizedOpenIds[0]);
                resetResponse();
            }
            toast.success("Petición eliminada", { description: request.name });
        } catch (error) {
            deletingIds.current.delete(request.id);
            toast.error("No se pudo eliminar la petición", {
                description: getErrorMessage(error),
            });
        }
    }

    async function activateRequest(requestId: string) {
        if (requestId === activeRequestIdRef.current) return;
        const isCurrent = navigationOperation.current.next();
        await flushActiveRequest();
        if (!isCurrent()) return;
        const request = requestsRef.current.find((candidate) => candidate.id === requestId);
        if (!request) return;
        setOpenRequestIds((current) =>
            current.includes(request.id) ? current : [...current, request.id],
        );
        setActiveRequestId(request.id);
        resetResponse();
    }

    async function closeRequest(requestId: string) {
        if (openRequestIdsRef.current.length === 1) return;
        const isCurrent = navigationOperation.current.next();
        const closing = requestsRef.current.find((request) => request.id === requestId);
        if (closing && settings.autoSaveRequests) await saveRequest(closing, "switch");
        if (!isCurrent()) return;
        const currentIds = openRequestIdsRef.current;
        if (currentIds.length === 1 || !currentIds.includes(requestId)) return;
        const closingIndex = currentIds.indexOf(requestId);
        const nextIds = currentIds.filter((id) => id !== requestId);
        setOpenRequestIds(nextIds);
        if (requestId === activeRequestIdRef.current) {
            setActiveRequestId(nextIds[Math.max(0, closingIndex - 1)] ?? nextIds[0]);
            resetResponse();
        }
    }

    useEffect(() => {
        function handleCloseShortcut(event: KeyboardEvent) {
            if (
                event.repeat ||
                event.altKey ||
                event.shiftKey ||
                (!event.ctrlKey && !event.metaKey) ||
                event.key.toLowerCase() !== "w"
            ) {
                return;
            }
            const workspace = pageRef.current?.closest<HTMLElement>(".workspace-view");
            if (workspace?.dataset.active !== "true") return;
            if (document.querySelector('[aria-modal="true"]')) {
                event.preventDefault();
                return;
            }
            event.preventDefault();
            if (openRequestIds.length > 1) void closeRequest(activeRequestId);
        }

        window.addEventListener("keydown", handleCloseShortcut);
        return () => window.removeEventListener("keydown", handleCloseShortcut);
    }, [activeRequestId, openRequestIds.length, settings.autoSaveRequests]);

    function updateActive(changes: Partial<SavedRequest>, invalidateResponse = true) {
        setRequestsAndRef((current) =>
            current.map((request) =>
                request.id === activeRequest.id ? { ...request, ...changes } : request,
            ),
        );
        setRequestSaveState(activeRequest.id, "idle");
        if (invalidateResponse) resetResponse();
    }

    function resetResponse() {
        responseOperation.current.invalidate();
        setResponseState({ status: "idle" });
    }

    async function send() {
        if (runningIds.current.has(activeRequest.id)) return;
        runningIds.current.add(activeRequest.id);
        setRunningRequestIds((current) => [...current, activeRequest.id]);
        const isCurrent = responseOperation.current.next();
        setResponseState({ status: "loading" });
        try {
            const response = await executeRequest(
                activeDraft,
                sessionVariables,
                settings.requestTimeoutMs,
            );
            void recordHistory({ request: activeRequest, response, source: "api" });
            if (!isCurrent()) return;
            setResponseState({ status: "success", response });
            toast.success(`${activeRequest.name}: ${response.status}`, {
                description: `${Math.round(response.durationMs)} ms · ${formatBytes(response.sizeBytes)}`,
                id: `request-send-${activeRequest.id}`,
            });
        } catch (error) {
            const message = getErrorMessage(error);
            void recordHistory({ error: message, request: activeRequest, source: "api" });
            if (!isCurrent()) return;
            setResponseState({ status: "error", message });
            toast.error(`Error al ejecutar ${activeRequest.name}`, {
                description: message,
                id: `request-send-${activeRequest.id}`,
            });
        } finally {
            runningIds.current.delete(activeRequest.id);
            setRunningRequestIds((current) => current.filter((id) => id !== activeRequest.id));
        }
    }

    async function save() {
        const request = requestsRef.current.find((candidate) => candidate.id === activeRequestId);
        if (request) await saveRequest(request, "manual");
    }

    async function flushActiveRequest() {
        if (!settings.autoSaveRequests) return;
        const request = requestsRef.current.find((candidate) => candidate.id === activeRequestId);
        if (request) await saveRequest(request, "switch");
    }

    async function saveRequest(
        request: SavedRequest,
        reason: "auto" | "manual" | "rename" | "switch",
    ) {
        if (!project || deletingIds.current.has(request.id)) return false;
        const signature = requestSnapshot(request);
        return saveQueue.current.enqueue(request.id, async () => {
            if (deletingIds.current.has(request.id)) return false;
            if (savedSnapshots.current.get(request.id) === signature) {
                setRequestSaveState(request.id, "saved");
                if (reason === "manual") {
                    toast.info("La petición ya está guardada", {
                        description: request.name,
                        id: `request-save-${request.id}`,
                    });
                }
                return true;
            }

            setRequestSaveState(request.id, "saving");
            try {
                const saved = await persistRequest(project.root, request);
                const savedSignature = requestSnapshot(saved);
                savedSnapshots.current.set(saved.id, savedSignature);
                setRequestsAndRef((current) =>
                    current.map((candidate) =>
                        candidate.id === saved.id && requestSnapshot(candidate) === signature
                            ? saved
                            : candidate,
                    ),
                );
                const latest = requestsRef.current.find((candidate) => candidate.id === saved.id);
                setRequestSaveState(
                    request.id,
                    latest && requestSnapshot(latest) !== savedSignature ? "idle" : "saved",
                );
                toast.success(
                    reason === "manual"
                        ? "Petición guardada"
                        : reason === "rename"
                          ? "Nombre actualizado"
                          : "Cambios guardados",
                    {
                        description: request.name,
                        id: `request-save-${request.id}`,
                    },
                );
                return true;
            } catch (error) {
                const message = getErrorMessage(error);
                setRequestSaveState(request.id, "error");
                toast.error(`No se pudo guardar ${request.name}`, {
                    description: message,
                    id: `request-save-${request.id}`,
                });
                return false;
            }
        });
    }

    function setRequestsAndRef(update: (current: SavedRequest[]) => SavedRequest[]) {
        const next = update(requestsRef.current);
        requestsRef.current = next;
        setRequests(next);
    }

    function setOpenRequestIds(update: string[] | ((current: string[]) => string[])) {
        const next = typeof update === "function" ? update(openRequestIdsRef.current) : update;
        openRequestIdsRef.current = next;
        setOpenRequestIdsState(next);
    }

    function setActiveRequestId(id: string) {
        activeRequestIdRef.current = id;
        setActiveRequestIdState(id);
    }

    function setRequestSaveState(requestId: string, state: RequestSaveState) {
        setSaveStates((current) =>
            current[requestId] === state ? current : { ...current, [requestId]: state },
        );
    }

    return (
        <section className="module-page api-page" ref={pageRef}>
            <ApiSidebar
                activeRequestId={activeRequest.id}
                folders={folders}
                hasProject={Boolean(project)}
                onCreateFolder={(name) => void createFolder(name)}
                onCreateRequest={(folder) => void create(folder)}
                onDeleteRequest={(request) => void deleteRequest(request)}
                onRenameRequest={(request, name) => void renameRequest(request, name)}
                onSelect={(request) => void activateRequest(request.id)}
            />
            <div className="module-workbench">
                <RequestTabs
                    activeRequestId={activeRequest.id}
                    onClose={(requestId) => void closeRequest(requestId)}
                    onCreate={() => void create()}
                    onSelect={(requestId) => void activateRequest(requestId)}
                    requests={openRequests}
                />
                <div className="api-page__split">
                    <RequestEditor
                        autoSave={settings.autoSaveRequests}
                        canSave={Boolean(project)}
                        draft={activeDraft}
                        isSending={runningRequestIds.includes(activeRequest.id)}
                        onChange={(draft) => updateActive(draft)}
                        onSave={() => void save()}
                        onSend={() => void send()}
                        requestId={activeRequest.id}
                        saveState={saveStates[activeRequest.id] ?? "idle"}
                    />
                    <ResponsePanel draft={activeDraft} state={responseState} />
                </div>
            </div>
        </section>
    );
}

const DEFAULT_FOLDER: RequestFolderSummary = { id: "general", name: "General" };

function newRequest(folder: RequestFolderSummary): SavedRequest {
    return {
        id: `request-${crypto.randomUUID()}`,
        collectionId: folder.id,
        collectionName: folder.name,
        name: "Nueva petición",
        method: "GET",
        url: "http://localhost:3000",
        params: [],
        headers: [{ id: "accept", enabled: true, key: "Accept", value: "application/json" }],
        body: "",
    };
}

function buildFolders(folders: RequestFolderSummary[], requests: SavedRequest[]): RequestFolder[] {
    const grouped = new Map<string, RequestFolder>(
        folders.map((folder) => [folder.id, { ...folder, requests: [] }]),
    );
    for (const request of requests) {
        const existing = grouped.get(request.collectionId);
        if (existing) existing.requests.push(request);
        else {
            grouped.set(request.collectionId, {
                id: request.collectionId,
                name: request.collectionName,
                requests: [request],
            });
        }
    }
    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function requestSnapshot(request: SavedRequest) {
    return JSON.stringify(request);
}

function formatBytes(bytes: number) {
    if (bytes < 1_024) return `${bytes} B`;
    return `${(bytes / 1_024).toFixed(bytes >= 10_240 ? 0 : 1)} KB`;
}
