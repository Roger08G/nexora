import { useEffect, useState } from "react";
import { FiActivity, FiCode, FiDatabase } from "react-icons/fi";
import type { RequestDraft, ResponseState } from "@/modules/api/types";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type ResponsePanelProps = {
    draft: RequestDraft;
    state: ResponseState;
};

type ResultTab = "body" | "headers";

export function ResponsePanel({ draft, state }: ResponsePanelProps) {
    const [activeTab, setActiveTab] = useState<ResultTab>("body");
    useEffect(() => setActiveTab("body"), [state]);

    const response = state.status === "success" ? state.response : null;
    const badge = getBadge(state);

    return (
        <section className="response-panel">
            <div className="panel-heading">
                <div className="panel-tabs" aria-label="Resultado">
                    <button
                        data-active={activeTab === "body"}
                        onClick={() => setActiveTab("body")}
                        type="button"
                    >
                        Respuesta
                    </button>
                    <button
                        data-active={activeTab === "headers"}
                        disabled={!response}
                        onClick={() => setActiveTab("headers")}
                        type="button"
                    >
                        Headers {response ? <small>{response.headers.length}</small> : null}
                    </button>
                    <button disabled type="button">
                        Diff DB
                    </button>
                </div>
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </div>

            {state.status === "success" ? (
                <div className="response-result">
                    <div className="response-result__meta">
                        <strong data-success={state.response.status < 400}>
                            {state.response.status} {state.response.statusText}
                        </strong>
                        <span>{state.response.durationMs} ms</span>
                        <span>{formatBytes(state.response.sizeBytes)}</span>
                    </div>
                    <pre>
                        {activeTab === "headers"
                            ? state.response.headers
                                  .map((header) => `${header.key}: ${header.value}`)
                                  .join("\n")
                            : formatBody(state.response.body)}
                    </pre>
                </div>
            ) : (
                <EmptyResponse draft={draft} state={state} />
            )}
        </section>
    );
}

function EmptyResponse({ draft, state }: ResponsePanelProps) {
    const content =
        state.status === "error"
            ? { title: "La petición ha fallado", description: state.message }
            : state.status === "loading"
              ? {
                    title: "Ejecutando petición",
                    description: "Esperando la respuesta del servidor…",
                }
              : {
                    title: "Lista para ejecutar",
                    description: "La respuesta y sus métricas aparecerán aquí.",
                };

    return (
        <div className="response-panel__empty">
            <div className="response-panel__icons" aria-hidden="true">
                <FiCode />
                <FiActivity />
                <FiDatabase />
            </div>
            <h2>{content.title}</h2>
            <p>{content.description}</p>
            <code>
                {draft.method} {draft.url}
            </code>
        </div>
    );
}

function getBadge(state: ResponseState) {
    if (state.status === "loading") return { label: "Ejecutando", tone: "violet" as const };
    if (state.status === "error") return { label: "Error", tone: "danger" as const };
    if (state.status === "success") {
        return {
            label: `${state.response.status}`,
            tone: state.response.status < 400 ? ("success" as const) : ("warning" as const),
        };
    }
    return { label: "Sin ejecutar", tone: "neutral" as const };
}

function formatBody(body: string) {
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
        return body;
    }
}

function formatBytes(bytes: number) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}
