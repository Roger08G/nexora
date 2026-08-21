import { useState } from "react";
import { FiCheck, FiLoader, FiSave, FiSend } from "react-icons/fi";
import type { RequestDraft, RequestSaveState } from "@/modules/api/types";
import { KeyValueEditor } from "@/modules/api/components/KeyValueEditor";
import { MethodSelect } from "@/modules/api/components/MethodSelect";
import { TemplateInput, TemplateTextarea } from "@/modules/api/components/TemplateField";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type EditorSection = "params" | "headers" | "body" | "auth";

type RequestEditorProps = {
    autoSave: boolean;
    canSave: boolean;
    draft: RequestDraft;
    isSending: boolean;
    onChange: (draft: RequestDraft) => void;
    onSave: () => void;
    onSend: () => void;
    saveState: RequestSaveState;
};

const SECTIONS: readonly { id: EditorSection; label: string }[] = [
    { id: "params", label: "Parámetros" },
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
];

export function RequestEditor({
    autoSave,
    canSave,
    draft,
    isSending,
    onChange,
    onSave,
    onSend,
    saveState,
}: RequestEditorProps) {
    const [activeSection, setActiveSection] = useState<EditorSection>("params");

    return (
        <section className="request-editor">
            <div className="request-editor__bar">
                <MethodSelect
                    onChange={(method) => onChange({ ...draft, method })}
                    value={draft.method}
                />
                <TemplateInput
                    aria-label="URL de la petición"
                    className="request-editor__url"
                    onValueChange={(url) => onChange({ ...draft, url })}
                    spellCheck={false}
                    value={draft.url}
                />
                <SaveState autoSave={autoSave} state={saveState} />
                <ActionButton disabled={isSending} icon={FiSend} onClick={onSend} tone="primary">
                    {isSending ? "Enviando" : "Enviar"}
                </ActionButton>
                <ActionButton
                    disabled={!canSave || saveState === "saving"}
                    icon={FiSave}
                    onClick={onSave}
                    title={canSave ? "Guardar en .nexora" : "Abre un proyecto para guardar"}
                    tone="secondary"
                >
                    {saveState === "saving" ? "Guardando" : "Guardar"}
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
                        <TemplateTextarea
                            aria-label="Body JSON"
                            className="code-editor__template"
                            onValueChange={(body) => onChange({ ...draft, body })}
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

function SaveState({ autoSave, state }: { autoSave: boolean; state: RequestSaveState }) {
    if (!autoSave && state === "idle") return <span className="request-save-state">Manual</span>;
    if (state === "saving") {
        return (
            <span className="request-save-state" data-state="saving">
                <FiLoader aria-hidden="true" /> Guardando…
            </span>
        );
    }
    if (state === "saved") {
        return (
            <span className="request-save-state" data-state="saved">
                <FiCheck aria-hidden="true" /> Guardado
            </span>
        );
    }
    if (state === "error") {
        return (
            <span className="request-save-state" data-state="error">
                Error al guardar
            </span>
        );
    }
    return <span className="request-save-state">Cambios sin guardar</span>;
}
