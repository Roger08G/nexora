import { FiSave, FiX } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MongoDocumentDialogProps = {
    error: string | null;
    isSaving: boolean;
    mode: "insert" | "edit";
    onChange: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
    value: string;
};

export function MongoDocumentDialog({
    error,
    isSaving,
    mode,
    onChange,
    onClose,
    onSave,
    value,
}: MongoDocumentDialogProps) {
    return (
        <div className="modal-backdrop" role="presentation">
            <section aria-modal="true" className="document-dialog" role="dialog">
                <header>
                    <div>
                        <strong>
                            {mode === "insert" ? "Insertar documento" : "Editar documento"}
                        </strong>
                        <small>JSON / MongoDB Extended JSON</small>
                    </div>
                    <button aria-label="Cerrar" onClick={onClose} type="button">
                        <FiX aria-hidden="true" />
                    </button>
                </header>
                <textarea
                    aria-label="Documento JSON"
                    autoFocus
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck={false}
                    value={value}
                />
                {error ? <div className="inline-error">{error}</div> : null}
                <footer>
                    <ActionButton onClick={onClose} tone="ghost">
                        Cancelar
                    </ActionButton>
                    <ActionButton disabled={isSaving} icon={FiSave} onClick={onSave} tone="primary">
                        {isSaving ? "Guardando" : "Guardar"}
                    </ActionButton>
                </footer>
            </section>
        </div>
    );
}
