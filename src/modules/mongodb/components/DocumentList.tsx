import { FiCopy, FiEdit2, FiFileText, FiTrash2 } from "react-icons/fi";
import { CodeViewer } from "@/shared/components/code/CodeViewer";

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
                                    navigator.clipboard.writeText(JSON.stringify(document, null, 4))
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
                    <CodeViewer
                        ariaLabel={`Documento ${index + 1}`}
                        language="json"
                        value={JSON.stringify(document, null, 4)}
                    />
                </article>
            ))}
        </div>
    );
}
