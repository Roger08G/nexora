import { useEffect, useMemo, useRef, useState } from "react";
import { FiZap } from "react-icons/fi";
import { toast } from "sonner";
import { useAppSettings } from "@/app/providers/AppSettingsProvider";
import { useGlobalSearch } from "@/app/providers/GlobalSearchProvider";
import { useProject } from "@/app/providers/ProjectProvider";
import { useSessionVariables } from "@/app/providers/SessionVariablesProvider";
import { ApiSidebar } from "@/modules/api/components/ApiSidebar";
import { RequestEditor } from "@/modules/api/components/RequestEditor";
import { RequestTabs } from "@/modules/api/components/RequestTabs";
import { ResponsePanel } from "@/modules/api/components/ResponsePanel";
import { executeRequest, loadRequests, persistRequest } from "@/modules/api/services/api.service";
import type {
    RequestCollection,
    RequestDraft,
    RequestSaveState,
    ResponseState,
    SavedRequest,
} from "@/modules/api/types";
import { getErrorMessage } from "@/shared/services/native";

export function ApiPage() {
    const { settings } = useAppSettings();
    const { registerItems } = useGlobalSearch();
    const { project } = useProject();
    const { values: sessionVariables } = useSessionVariables();
    const [requests, setRequests] = useState<SavedRequest[]>(() => [newRequest()]);
    const [openRequestIds, setOpenRequestIds] = useState<string[]>(() => [requests[0].id]);
    const [activeRequestId, setActiveRequestId] = useState(requests[0].id);
    const [responseState, setResponseState] = useState<ResponseState>({ status: "idle" });
    const [saveStates, setSaveStates] = useState<Record<string, RequestSaveState>>({});
    const [requestsLoaded, setRequestsLoaded] = useState(false);
    const requestsRef = useRef(requests);
    const savedSnapshots = useRef(new Map<string, string>());
    const saveQueue = useRef(new Map<string, Promise<boolean>>());

    useEffect(() => {
        requestsRef.current = requests;
    }, [requests]);

    useEffect(() => {
        if (!project) return;
        let active = true;
        setRequestsLoaded(false);
        loadRequests(project.root)
            .then((saved) => {
                if (!active) return;
                const next = saved.length > 0 ? saved : [newRequest()];
                requestsRef.current = next;
                savedSnapshots.current = new Map(
                    saved.map((request) => [request.id, requestSnapshot(request)]),
                );
                setRequests(next);
                setSaveStates(
                    Object.fromEntries(saved.map((request) => [request.id, "saved" as const])),
                );
                setOpenRequestIds([next[0].id]);
                setActiveRequestId(next[0].id);
                setResponseState({ status: "idle" });
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

    const collections = useMemo(() => buildCollections(requests), [requests]);
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
        if (savedSnapshots.current.get(activeRequest.id) === requestSnapshot(activeRequest)) {
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
        () => () => {
            if (!project || !requestsLoaded || !settings.autoSaveRequests) return;
            for (const request of requestsRef.current) {
                if (savedSnapshots.current.get(request.id) !== requestSnapshot(request)) {
                    void persistRequest(project.root, request);
                }
            }
        },
        [project, requestsLoaded, settings.autoSaveRequests],
    );

    async function create() {
        await flushActiveRequest();
        const request = newRequest();
        setRequestsAndRef((current) => [...current, request]);
        setOpenRequestIds((current) => [...current, request.id]);
        setActiveRequestId(request.id);
        setResponseState({ status: "idle" });
        toast.info("Nueva petición creada", { description: "Ponle un nombre y empieza a editar." });
    }

    async function activateRequest(requestId: string) {
        if (requestId === activeRequestId) return;
        await flushActiveRequest();
        const request = requestsRef.current.find((candidate) => candidate.id === requestId);
        if (!request) return;
        setOpenRequestIds((current) =>
            current.includes(request.id) ? current : [...current, request.id],
        );
        setActiveRequestId(request.id);
        setResponseState({ status: "idle" });
    }

    async function closeRequest(requestId: string) {
        if (openRequestIds.length === 1) return;
        const closing = requestsRef.current.find((request) => request.id === requestId);
        if (closing && settings.autoSaveRequests) await saveRequest(closing, "switch");
        const closingIndex = openRequestIds.indexOf(requestId);
        const nextIds = openRequestIds.filter((id) => id !== requestId);
        setOpenRequestIds(nextIds);
        if (requestId === activeRequestId) {
            setActiveRequestId(nextIds[Math.max(0, closingIndex - 1)] ?? nextIds[0]);
            setResponseState({ status: "idle" });
        }
    }

    function updateActive(changes: Partial<SavedRequest>, invalidateResponse = true) {
        setRequestsAndRef((current) =>
            current.map((request) =>
                request.id === activeRequest.id ? { ...request, ...changes } : request,
            ),
        );
        setRequestSaveState(activeRequest.id, "idle");
        if (invalidateResponse) setResponseState({ status: "idle" });
    }

    async function send() {
        setResponseState({ status: "loading" });
        try {
            const response = await executeRequest(
                activeDraft,
                sessionVariables,
                settings.requestTimeoutMs,
            );
            setResponseState({ status: "success", response });
            toast.success(`${activeRequest.name}: ${response.status}`, {
                description: `${Math.round(response.durationMs)} ms · ${formatBytes(response.sizeBytes)}`,
                id: `request-send-${activeRequest.id}`,
            });
        } catch (error) {
            const message = getErrorMessage(error);
            setResponseState({ status: "error", message });
            toast.error(`Error al ejecutar ${activeRequest.name}`, {
                description: message,
                id: `request-send-${activeRequest.id}`,
            });
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

    async function saveRequest(request: SavedRequest, reason: "auto" | "manual" | "switch") {
        if (!project) return false;
        const signature = requestSnapshot(request);
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

        const queued = saveQueue.current.get(request.id);
        if (queued) await queued;
        if (savedSnapshots.current.get(request.id) === signature) return true;

        setRequestSaveState(request.id, "saving");
        const operation = (async () => {
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
                setRequestSaveState(request.id, "saved");
                toast.success(reason === "manual" ? "Petición guardada" : "Cambios guardados", {
                    description: request.name,
                    id: `request-save-${request.id}`,
                });
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
        })();
        saveQueue.current.set(request.id, operation);
        const result = await operation;
        if (saveQueue.current.get(request.id) === operation) saveQueue.current.delete(request.id);
        return result;
    }

    function setRequestsAndRef(update: (current: SavedRequest[]) => SavedRequest[]) {
        setRequests((current) => {
            const next = update(current);
            requestsRef.current = next;
            return next;
        });
    }

    function setRequestSaveState(requestId: string, state: RequestSaveState) {
        setSaveStates((current) =>
            current[requestId] === state ? current : { ...current, [requestId]: state },
        );
    }

    return (
        <section className="module-page api-page">
            <ApiSidebar
                activeRequestId={activeRequest.id}
                collections={collections}
                hasProject={Boolean(project)}
                onCreate={() => void create()}
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
                        isSending={responseState.status === "loading"}
                        onChange={(draft) => updateActive(draft)}
                        onNameChange={(name) => updateActive({ name }, false)}
                        onSave={() => void save()}
                        onSend={() => void send()}
                        requestName={activeRequest.name}
                        saveState={saveStates[activeRequest.id] ?? "idle"}
                    />
                    <ResponsePanel draft={activeDraft} state={responseState} />
                </div>
            </div>
        </section>
    );
}

function newRequest(): SavedRequest {
    return {
        id: `request-${crypto.randomUUID()}`,
        collectionId: "general",
        collectionName: "General",
        name: "Nueva petición",
        method: "GET",
        url: "http://localhost:3000",
        params: [],
        headers: [{ id: "accept", enabled: true, key: "Accept", value: "application/json" }],
        body: "",
    };
}

function buildCollections(requests: SavedRequest[]): RequestCollection[] {
    const grouped = new Map<string, RequestCollection>();
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
    return [...grouped.values()];
}

function requestSnapshot(request: SavedRequest) {
    return JSON.stringify(request);
}

function formatBytes(bytes: number) {
    if (bytes < 1_024) return `${bytes} B`;
    return `${(bytes / 1_024).toFixed(bytes >= 10_240 ? 0 : 1)} KB`;
}
