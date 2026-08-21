import { useMemo, useState } from "react";
import { ApiSidebar } from "@/modules/api/components/ApiSidebar";
import { RequestEditor } from "@/modules/api/components/RequestEditor";
import { RequestTabs } from "@/modules/api/components/RequestTabs";
import { ResponsePanel } from "@/modules/api/components/ResponsePanel";
import { createDraft, DEMO_COLLECTIONS, DEMO_REQUESTS } from "@/modules/api/data/api.fixtures";
import type { RequestDraft, ResponseState, SavedRequest } from "@/modules/api/types";

const INITIAL_REQUEST_IDS = ["list-users", "create-user"];

function buildInitialDrafts(): Record<string, RequestDraft> {
    return Object.fromEntries(DEMO_REQUESTS.map((request) => [request.id, createDraft(request)]));
}

export function ApiPage() {
    const [openRequestIds, setOpenRequestIds] = useState(INITIAL_REQUEST_IDS);
    const [activeRequestId, setActiveRequestId] = useState(INITIAL_REQUEST_IDS[0]);
    const [drafts, setDrafts] = useState<Record<string, RequestDraft>>(buildInitialDrafts);
    const [responseState, setResponseState] = useState<ResponseState>("idle");

    const openRequests = useMemo(
        () =>
            openRequestIds.flatMap((id) => {
                const request = DEMO_REQUESTS.find((candidate) => candidate.id === id);
                return request ? [request] : [];
            }),
        [openRequestIds],
    );
    const activeRequest =
        DEMO_REQUESTS.find((request) => request.id === activeRequestId) ?? DEMO_REQUESTS[0];
    const activeDraft = drafts[activeRequest.id] ?? createDraft(activeRequest);

    function selectRequest(request: SavedRequest) {
        setOpenRequestIds((current) =>
            current.includes(request.id) ? current : [...current, request.id],
        );
        setActiveRequestId(request.id);
        setResponseState("idle");
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

    function updateActiveDraft(draft: RequestDraft) {
        setDrafts((current) => ({ ...current, [activeRequest.id]: draft }));
        setResponseState("idle");
    }

    return (
        <section className="module-page api-page">
            <ApiSidebar
                activeRequestId={activeRequest.id}
                collections={DEMO_COLLECTIONS}
                onSelect={selectRequest}
            />
            <div className="module-workbench">
                <RequestTabs
                    activeRequestId={activeRequest.id}
                    onClose={closeRequest}
                    onSelect={(requestId) => {
                        setActiveRequestId(requestId);
                        setResponseState("idle");
                    }}
                    requests={openRequests}
                />
                <div className="api-page__split">
                    <RequestEditor
                        draft={activeDraft}
                        onChange={updateActiveDraft}
                        onSend={() => setResponseState("backend-required")}
                        requestName={activeRequest.name}
                    />
                    <ResponsePanel draft={activeDraft} state={responseState} />
                </div>
            </div>
        </section>
    );
}
