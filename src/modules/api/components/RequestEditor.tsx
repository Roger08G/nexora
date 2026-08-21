import { useState } from "react";
import { FiSave, FiSend } from "react-icons/fi";
import type { RequestDraft } from "@/modules/api/types";
import { KeyValueEditor } from "@/modules/api/components/KeyValueEditor";
import { MethodSelect } from "@/modules/api/components/MethodSelect";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type EditorSection = "params" | "headers" | "body" | "auth";

type RequestEditorProps = {
    draft: RequestDraft;
    onChange: (draft: RequestDraft) => void;
    onSend: () => void;
    requestName: string;
};

const SECTIONS: readonly { id: EditorSection; label: string }[] = [
    { id: "params", label: "Parámetros" },
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
];

export function RequestEditor({ draft, onChange, onSend, requestName }: RequestEditorProps) {
    const [activeSection, setActiveSection] = useState<EditorSection>("params");

    return (
        <section className="request-editor">
            <div className="request-editor__bar">
                <MethodSelect
                    onChange={(method) => onChange({ ...draft, method })}
                    value={draft.method}
                />
                <input
                    aria-label="URL de la petición"
                    className="request-editor__url"
                    onChange={(event) => onChange({ ...draft, url: event.target.value })}
                    spellCheck={false}
                    value={draft.url}
                />
                <ActionButton icon={FiSend} onClick={onSend} tone="primary">
                    Enviar
                </ActionButton>
                <ActionButton
                    disabled
                    icon={FiSave}
                    title="Persistencia pendiente"
                    tone="secondary"
                >
                    Guardar
                </ActionButton>
            </div>

            <div className="panel-heading">
                <div className="panel-tabs" role="tablist">
                    {SECTIONS.map((section) => (
                        <button
                            aria-selected={activeSection === section.id}
                            data-active={activeSection === section.id}
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            role="tab"
                            type="button"
                        >
                            {section.label}
                            {section.id === "params" && draft.params.length > 0 ? (
                                <small>{draft.params.filter((item) => item.enabled).length}</small>
                            ) : null}
                            {section.id === "headers" && draft.headers.length > 0 ? (
                                <small>{draft.headers.filter((item) => item.enabled).length}</small>
                            ) : null}
                        </button>
                    ))}
                </div>
                <span className="panel-heading__context">{requestName}</span>
            </div>

            <div className="request-editor__content">
                {activeSection === "params" ? (
                    <KeyValueEditor
                        items={draft.params}
                        onChange={(params) => onChange({ ...draft, params })}
                    />
                ) : null}
                {activeSection === "headers" ? (
                    <KeyValueEditor
                        items={draft.headers}
                        onChange={(headers) => onChange({ ...draft, headers })}
                    />
                ) : null}
                {activeSection === "body" ? (
                    <div className="code-editor">
                        <div className="code-editor__meta">
                            <span>JSON</span>
                            <small>UTF-8</small>
                        </div>
                        <textarea
                            aria-label="Body JSON"
                            onChange={(event) => onChange({ ...draft, body: event.target.value })}
                            placeholder="Esta petición no tiene body"
                            spellCheck={false}
                            value={draft.body}
                        />
                    </div>
                ) : null}
                {activeSection === "auth" ? (
                    <div className="auth-preview">
                        <span>Bearer token</span>
                        <code>{"{{token}}"}</code>
                        <p>La referencia se resolverá desde el entorno local activo.</p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
