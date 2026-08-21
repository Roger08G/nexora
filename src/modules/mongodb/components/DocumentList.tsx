import { FiCopy, FiEdit2, FiFileText, FiTrash2 } from "react-icons/fi";

type DocumentListProps = {
    documents: readonly Record<string, unknown>[];
    onDelete: (document: Record<string, unknown>) => void;
    onEdit: (document: Record<string, unknown>) => void;
};

export function DocumentList({ documents, onDelete, onEdit }: DocumentListProps) {
    return (
        <div className="document-list">
            {documents.map((document, index) => (
                <article className="document-card" key={JSON.stringify(document._id ?? index)}>
                    <header>
                        <FiFileText aria-hidden="true" />
                        <span>documento {index + 1}</span>
                        <div>
                            <button
                                aria-label="Copiar documento"
                                onClick={() =>
                                    navigator.clipboard.writeText(JSON.stringify(document, null, 2))
                                }
                                type="button"
                            >
                                <FiCopy aria-hidden="true" />
                            </button>
                            <button
                                aria-label="Editar documento"
                                onClick={() => onEdit(document)}
                                type="button"
                            >
                                <FiEdit2 aria-hidden="true" />
                            </button>
                            <button
                                aria-label="Eliminar documento"
                                onClick={() => onDelete(document)}
                                type="button"
                            >
                                <FiTrash2 aria-hidden="true" />
                            </button>
                        </div>
                    </header>
                    <pre>{JSON.stringify(document, null, 2)}</pre>
                </article>
            ))}
        </div>
    );
}
