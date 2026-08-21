import { FiDatabase, FiX } from "react-icons/fi";
import { ActionButton } from "@/shared/components/ui/ActionButton";

type MongoNamespaceDialogProps = {
    collection: string;
    database: string;
    error: string | null;
    isSaving: boolean;
    onClose: () => void;
    onCollectionChange: (value: string) => void;
    onDatabaseChange: (value: string) => void;
    onSave: () => void;
};

export function MongoNamespaceDialog({
    collection,
    database,
    error,
    isSaving,
    onClose,
    onCollectionChange,
    onDatabaseChange,
    onSave,
}: MongoNamespaceDialogProps) {
    const canSave = Boolean(database.trim() && collection.trim()) && !isSaving;

    return (
        <div className="modal-backdrop" role="presentation">
            <section
                aria-labelledby="mongo-namespace-title"
                aria-modal="true"
                className="document-dialog namespace-dialog"
                role="dialog"
            >
                <header>
                    <div>
                        <strong id="mongo-namespace-title">Nueva colección</strong>
                        <small>MongoDB creará la base si todavía no existe</small>
                    </div>
                    <button aria-label="Cerrar" onClick={onClose} type="button">
                        <FiX aria-hidden="true" />
                    </button>
                </header>
                <div className="namespace-dialog__fields">
                    <label>
                        <span>Base de datos</span>
                        <input
                            autoFocus
                            onChange={(event) => onDatabaseChange(event.target.value)}
                            spellCheck={false}
                            value={database}
                        />
                    </label>
                    <label>
                        <span>Colección</span>
                        <input
                            onChange={(event) => onCollectionChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && canSave) onSave();
                            }}
                            spellCheck={false}
                            value={collection}
                        />
                    </label>
                    {error ? <div className="inline-error">{error}</div> : null}
                </div>
                <footer>
                    <ActionButton onClick={onClose} tone="ghost">
                        Cancelar
                    </ActionButton>
                    <ActionButton
                        disabled={!canSave}
                        icon={FiDatabase}
                        onClick={onSave}
                        tone="primary"
                    >
                        {isSaving ? "Creando" : "Crear colección"}
                    </ActionButton>
                </footer>
            </section>
        </div>
    );
}
