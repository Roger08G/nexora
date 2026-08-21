import { FiActivity, FiCode, FiDatabase } from "react-icons/fi";
import type { RequestDraft, ResponseState } from "@/modules/api/types";
import { StatusBadge } from "@/shared/components/ui/StatusBadge";

type ResponsePanelProps = {
    draft: RequestDraft;
    state: ResponseState;
};

export function ResponsePanel({ draft, state }: ResponsePanelProps) {
    return (
        <section className="response-panel">
            <div className="panel-heading">
                <div className="panel-tabs" aria-label="Resultado">
                    <button data-active type="button">
                        Respuesta
                    </button>
                    <button disabled type="button">
                        Headers
                    </button>
                    <button disabled type="button">
                        Diff DB
                    </button>
                </div>
                <StatusBadge tone={state === "idle" ? "neutral" : "warning"}>
                    {state === "idle" ? "Sin ejecutar" : "Núcleo Rust requerido"}
                </StatusBadge>
            </div>
            <div className="response-panel__empty">
                <div className="response-panel__icons" aria-hidden="true">
                    <FiCode />
                    <FiActivity />
                    <FiDatabase />
                </div>
                <h2>{state === "idle" ? "Lista para ejecutar" : "Motor HTTP aún no conectado"}</h2>
                <p>
                    {state === "idle"
                        ? "La respuesta, sus métricas y el impacto en base de datos aparecerán aquí."
                        : "La interfaz ha conservado la petición sin simular una respuesta. El siguiente paso será ejecutarla desde Tauri/Rust."}
                </p>
                <code>
                    {draft.method} {draft.url}
                </code>
            </div>
        </section>
    );
}
