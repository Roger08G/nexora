import { useState } from "react";
import { FiSave, FiSend } from "react-icons/fi";
import type { RequestDraft } from "@/modules/api/types";
import { KeyValueEditor } from "@/modules/api/components/KeyValueEditor";
import { MethodSelect } from "@/modules/api/components/MethodSelect";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type EditorSection = "params" | "headers" | "body" | "auth";

type RequestEditorProps = {
    canSave: boolean;
    draft: RequestDraft;
    isSaving: boolean;
    isSending: boolean;
    onChange: (draft: RequestDraft) => void;
    onNameChange: (name: string) => void;
    onSave: () => void;
    onSend: () => void;
    requestName: string;
};

const SECTIONS: readonly { id: EditorSection; label: string }[] = [
    { id: "params", label: "Parámetros" },
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
];

export function RequestEditor({
    canSave,
    draft,
    isSaving,
    isSending,
    onChange,
    onNameChange,
    onSave,
    onSend,
    requestName,
}: RequestEditorProps) {
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
                <ActionButton disabled={isSending} icon={FiSend} onClick={onSend} tone="primary">
                    {isSending ? "Enviando" : "Enviar"}
                </ActionButton>
                <ActionButton
                    disabled={!canSave || isSaving}
                    icon={FiSave}
                    onClick={onSave}
                    title={canSave ? "Guardar en .nexora" : "Abre un proyecto para guardar"}
                    tone="secondary"
                >
                    {isSaving ? "Guardando" : "Guardar"}
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
                <input
                    aria-label="Nombre de la petición"
                    className="panel-heading__name"
                    maxLength={120}
                    onChange={(event) => onNameChange(event.target.value)}
                    value={requestName}
                />
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
                        <span>Autenticación por headers</span>
                        <code>Authorization: Bearer &lt;token&gt;</code>
                        <p>
                            Añade el header en Headers usando una referencia como {"{{token}}"}. El
                            valor se configura en Variables de sesión y nunca se guarda en Git.
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
