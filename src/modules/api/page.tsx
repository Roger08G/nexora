import { useEffect, useMemo, useState } from "react";
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
    ResponseState,
    SavedRequest,
} from "@/modules/api/types";
import { getErrorMessage } from "@/shared/services/native";

export function ApiPage() {
    const { project } = useProject();
    const { values: sessionVariables } = useSessionVariables();
    const [requests, setRequests] = useState<SavedRequest[]>(() => [newRequest()]);
    const [openRequestIds, setOpenRequestIds] = useState<string[]>(() => [requests[0].id]);
    const [activeRequestId, setActiveRequestId] = useState(requests[0].id);
    const [responseState, setResponseState] = useState<ResponseState>({ status: "idle" });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!project) return;
        let active = true;
        loadRequests(project.root)
            .then((saved) => {
                if (!active) return;
                const next = saved.length > 0 ? saved : [newRequest()];
                setRequests(next);
                setOpenRequestIds([next[0].id]);
                setActiveRequestId(next[0].id);
                setResponseState({ status: "idle" });
            })
            .catch((error) => {
                if (active) setResponseState({ status: "error", message: getErrorMessage(error) });
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

    function create() {
        const request = newRequest();
        setRequests((current) => [...current, request]);
        setOpenRequestIds((current) => [...current, request.id]);
        setActiveRequestId(request.id);
        setResponseState({ status: "idle" });
    }

    function selectRequest(request: SavedRequest) {
        setOpenRequestIds((current) =>
            current.includes(request.id) ? current : [...current, request.id],
        );
        setActiveRequestId(request.id);
        setResponseState({ status: "idle" });
    }

    function closeRequest(requestId: string) {
        if (openRequestIds.length === 1) return;
        const closingIndex = openRequestIds.indexOf(requestId);
        const nextIds = openRequestIds.filter((id) => id !== requestId);
        setOpenRequestIds(nextIds);
        if (requestId === activeRequestId) {
            setActiveRequestId(nextIds[Math.max(0, closingIndex - 1)] ?? nextIds[0]);
        }
    }

    function updateActive(changes: Partial<SavedRequest>) {
        setRequests((current) =>
            current.map((request) =>
                request.id === activeRequest.id ? { ...request, ...changes } : request,
            ),
        );
        setResponseState({ status: "idle" });
    }

    async function send() {
        setResponseState({ status: "loading" });
        try {
            const response = await executeRequest(activeDraft, sessionVariables);
            setResponseState({ status: "success", response });
        } catch (error) {
            setResponseState({ status: "error", message: getErrorMessage(error) });
        }
    }

    async function save() {
        if (!project) return;
        setIsSaving(true);
        try {
            const saved = await persistRequest(project.root, activeRequest);
            updateActive(saved);
        } catch (error) {
            setResponseState({ status: "error", message: getErrorMessage(error) });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section className="module-page api-page">
            <ApiSidebar
                activeRequestId={activeRequest.id}
                collections={collections}
                hasProject={Boolean(project)}
                onCreate={create}
                onSelect={selectRequest}
            />
            <div className="module-workbench">
                <RequestTabs
                    activeRequestId={activeRequest.id}
                    onClose={closeRequest}
                    onCreate={create}
                    onSelect={(requestId) => {
                        setActiveRequestId(requestId);
                        setResponseState({ status: "idle" });
                    }}
                    requests={openRequests}
                />
                <div className="api-page__split">
                    <RequestEditor
                        canSave={Boolean(project)}
                        draft={activeDraft}
                        isSaving={isSaving}
                        isSending={responseState.status === "loading"}
                        onChange={(draft) => updateActive(draft)}
                        onNameChange={(name) => updateActive({ name })}
                        onSave={save}
                        onSend={send}
                        requestName={activeRequest.name}
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
